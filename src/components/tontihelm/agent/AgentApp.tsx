"use client";
// TontiHelm — application agent (PWA mobile-first, M3 §15.8) :
// barre du bas à 4 entrées, indicateur de synchronisation, bannière hors réseau,
// file d'envoi locale (outbox) synchronisée par lots de 50, idempotente.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "../Logo";
import { SyncStatusPill } from "../StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { get, post } from "@/lib/client";
import { OutboxEvent, SessionUser, TourData, TourStop, formatFCFA } from "@/lib/types";
import { TourScreen } from "./TourScreen";
import { CollectScreen, CollectAllocation } from "./CollectScreen";
import { ClosingScreen } from "./ClosingScreen";
import { AccountScreen } from "./AccountScreen";
import { MapPin, Wallet, Scale, User, WifiOff, ArrowLeft, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const OUTBOX_KEY = "tontihelm_outbox";
const SIMOFFLINE_KEY = "tontihelm_offline_sim";

type Tab = "tour" | "collect" | "closing" | "account";

function loadOutbox(): OutboxEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]") as OutboxEvent[];
  } catch {
    return [];
  }
}

function saveOutbox(events: OutboxEvent[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(events));
}

export function AgentApp({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("tour");
  const [tour, setTour] = useState<TourData | null>(null);
  const [loadingTour, setLoadingTour] = useState(true);
  const [outbox, setOutbox] = useState<OutboxEvent[]>([]);
  const [simOffline, setSimOffline] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeStop, setActiveStop] = useState<TourStop | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const syncingRef = useRef(false);

  // ── État réseau et simulation hors ligne (démo préproduction) ──
  useEffect(() => {
    setNetworkOnline(navigator.onLine);
    setSimOffline(localStorage.getItem(SIMOFFLINE_KEY) === "1");
    setOutbox(loadOutbox());
    const on = () => setNetworkOnline(true);
    const off = () => setNetworkOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const online = networkOnline && !simOffline;

  // ── Chargement de la tournée ──
  const refreshTour = useCallback(async () => {
    setLoadingTour(true);
    try {
      const data = await get<TourData>("/api/agent/tour");
      setTour(data);
    } catch {
      toast({ title: "Tournée indisponible", description: "Impossible de charger la tournée du jour." });
    } finally {
      setLoadingTour(false);
    }
  }, []);

  useEffect(() => {
    refreshTour();
  }, [refreshTour, reloadKey]);

  // ── Synchronisation : envoi de l'outbox par lots de 50, idempotent ──
  // Chaque événement porte la journée réelle qu'il couvre (coversOn) :
  // le serveur pose une écriture par journée, le carnet marque chaque jour exact.
  const flushOutbox = useCallback(
    async (events: OutboxEvent[]) => {
      if (syncingRef.current || events.length === 0) return;
      syncingRef.current = true;
      setSyncing(true);
      try {
        let remaining = [...events];
        while (remaining.length > 0) {
          const batch = remaining.slice(0, 50);
          await post<{ acks: { id: string; status: string }[] }>("/api/agent/sync", {
            events: batch.map((e) => ({
              id: e.id, passbookId: e.passbookId, amount: e.amount,
              method: e.method, advance: e.advance, coversOn: e.coversOn, collectedAt: e.collectedAt,
            })),
          });
          const sent = new Set(batch.map((b) => b.id));
          remaining = remaining.filter((r) => !sent.has(r.id));
          setOutbox(remaining);
          saveOutbox(remaining);
        }
        toast({ title: "Tout est synchronisé." });
        setReloadKey((k) => k + 1);
      } catch (err) {
        // En cas d'échec réseau : reprise avec attente croissante (ici, simple garde).
        toast({
          title: "Envoi en attente",
          description: err instanceof Error ? err.message : "Ils partent dès le retour du réseau.",
        });
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (online && outbox.length > 0 && !syncingRef.current) {
      void flushOutbox(outbox);
    }
  }, [online, outbox, flushOutbox]);

  // ── Encaissement local : une écriture par journée couverte, dans l'outbox,
  // avec retour visuel immédiat (solde + marquage du jour). ──
  const collect = useCallback(
    (stop: TourStop, allocations: CollectAllocation[]) => {
      const total = allocations.reduce((s, a) => s + a.amount, 0);
      const events: OutboxEvent[] = allocations
        .filter((a) => a.amount > 0)
        .map((a) => ({
          id: crypto.randomUUID(),
          passbookId: stop.passbookId,
          amount: a.amount,
          method: "cash" as const,
          advance: false,
          coversOn: a.date,
          collectedAt: new Date().toISOString(),
          passbookNumber: stop.passbookNumber,
          contributorName: stop.contributorName,
        }));
      if (events.length === 0) return;
      const next = [...outbox, ...events];
      setOutbox(next);
      saveOutbox(next);
      if (navigator.vibrate) navigator.vibrate(60);
      const jours = events.length;
      toast({
        title: `${formatFCFA(total)} encaissés chez ${stop.contributorName}.`,
        description:
          jours > 1
            ? `${jours} journées couvertes (${online ? "synchronisation en cours" : "en attente d'envoi : enregistré sur ton téléphone"}).`
            : online
              ? undefined
              : "En attente d'envoi : enregistré sur ton téléphone.",
      });
      // Mise à jour optimiste de la tournée locale (solde, jours, marquage des journées).
      setTour((t) =>
        t
          ? {
              ...t,
              stops: t.stops.map((s) =>
                s.passbookId === stop.passbookId
                  ? {
                      ...s,
                      balance: s.balance + total,
                      paidDays: s.paidDays + Math.floor(total / s.dailyAmount),
                      days: s.days.map((d) => {
                        const alloc = allocations.find((a) => a.date === d.date);
                        return alloc ? { ...d, net: d.net + alloc.amount } : d;
                      }),
                      collectedToday: s.collectedToday
                        ? { count: s.collectedToday.count + events.length, amount: s.collectedToday.amount + total, method: "cash", at: new Date().toISOString() }
                        : { count: events.length, amount: total, method: "cash", at: new Date().toISOString() },
                    }
                  : s
              ),
              summary: {
                ...t.summary,
                collected: t.summary.collected + 1,
                remaining: Math.max(0, t.summary.remaining - 1),
                expectedCash: t.summary.expectedCash + total,
              },
            }
          : t
      );
    },
    [outbox, online]
  );

  const toggleSimOffline = useCallback((value: boolean) => {
    setSimOffline(value);
    localStorage.setItem(SIMOFFLINE_KEY, value ? "1" : "0");
    if (!value) toast({ title: "Réseau rétabli", description: "La synchronisation part automatiquement." });
  }, []);

  const syncState: "synced" | "pending" | "offline" | "error" = !online
    ? "offline"
    : outbox.length > 0
      ? "pending"
      : "synced";

  const pendingCount = outbox.length;

  const stopAt = useMemo(
    () => tour?.stops.find((s) => s.passbookId === activeStop?.passbookId) ?? activeStop,
    [tour, activeStop]
  );

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "tour", label: "Tournée", icon: MapPin },
    { id: "collect", label: "Encaisser", icon: Wallet },
    { id: "closing", label: "Clôture", icon: Scale },
    { id: "account", label: "Compte", icon: User },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* Barre du haut : structure, agent, état de synchronisation */}
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {activeStop && tab === "collect" ? (
              <button
                onClick={() => { setActiveStop(null); setTab("tour"); }}
                className="inline-flex items-center gap-1 text-sm font-medium text-subtle hover:text-ink"
                aria-label="Retour à la tournée"
              >
                <ArrowLeft className="h-5 w-5 tontihelm-icon" aria-hidden /> Tournée
              </button>
            ) : (
              <>
                <LogoMark size={32} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight text-ink">{tour?.structure.name ?? "TontiHelm"}</p>
                  <p className="truncate text-xs text-subtle">{user.fullName}</p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {syncing && <RefreshCw className="h-4 w-4 animate-spin text-info" aria-hidden />}
            <SyncStatusPill state={syncState} pendingCount={pendingCount} />
          </div>
        </div>
        {/* Bannière hors réseau (§13.4) — visible seulement hors réseau */}
        {!online && (
          <div className="mx-auto max-w-2xl px-4 pb-3">
            <Alert className="border-[#F0D48A] bg-[#FFF4D6]">
              <WifiOff className="h-4 w-4 text-warning" aria-hidden />
              <AlertDescription className="text-[13px] font-medium text-[#A66A00]">
                Pas de réseau. Continue ta tournée, tout est enregistré sur ton téléphone.
              </AlertDescription>
            </Alert>
          </div>
        )}
        {online && pendingCount > 0 && (
          <div className="mx-auto max-w-2xl px-4 pb-3">
            <Alert className="border-[#C5D8ED] bg-[#E8F1FD]">
              <RefreshCw className={cn("h-4 w-4 text-info", syncing && "animate-spin")} aria-hidden />
              <AlertDescription className="text-[13px] font-medium text-[#0B6BCB]">
                {pendingCount} encaissement{pendingCount > 1 ? "s" : ""} en attente d'envoi. {"Ils partent dès le retour du réseau."}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </header>

      {/* Contenu */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-36 pt-4" aria-live="polite">
        {tab === "tour" && (
          <TourScreen
            tour={tour}
            loading={loadingTour}
            outbox={outbox}
            onOpenStop={(stop) => { setActiveStop(stop); setTab("collect"); }}
          />
        )}
        {tab === "collect" && (
          <CollectScreen
            tour={tour}
            stop={stopAt}
            online={online}
            pendingCount={pendingCount}
            onCollect={collect}
            onSelectStop={(stop) => setActiveStop(stop)}
            loading={loadingTour}
          />
        )}
        {tab === "closing" && (
          <ClosingScreen
            tour={tour}
            online={online}
            outbox={outbox}
            onDeclared={() => setReloadKey((k) => k + 1)}
          />
        )}
        {tab === "account" && (
          <AccountScreen
            user={user}
            tour={tour}
            outbox={outbox}
            simOffline={simOffline}
            onToggleSimOffline={toggleSimOffline}
            onFlush={() => flushOutbox(outbox)}
            onLogout={onLogout}
          />
        )}
      </main>

      {/* Barre du bas à 4 entrées (§15.8) — cibles 48 px minimum */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white"
        aria-label="Navigation de l'application agent"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id !== "collect") setActiveStop(null); }}
              className={cn(
                "flex min-h-[56px] flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium transition-colors",
                tab === t.id ? "text-primary" : "text-subtle hover:text-ink"
              )}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <t.icon className="h-5 w-5 tontihelm-icon" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
