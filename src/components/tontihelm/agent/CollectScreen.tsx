"use client";
// TontiHelm — écran d'encaissement multi-jours (maquette §15.9, extension 2026-10) :
// le cotisant peut régler aujourd'hui, demain, après-demain… sans limite autre que
// les bornes du cycle, et rattraper les jours manqués. Chaque journée sélectionnée
// devient une écriture datée sur la journée réelle qu'elle couvre — le carnet
// calendaire marque chaque jour exact, y compris les jours payés d'avance.
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PassbookStatusBadge, SyncStatusPill } from "../StatusBadge";
import { TourData, TourStop, formatFCFA } from "@/lib/types";
import { Wallet, ChevronRight, Link2, Check, CalendarClock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Allocation d'un encaissement : une écriture par journée couverte. */
export interface CollectAllocation {
  date: string; // "AAAA-MM-JJ"
  amount: number;
}

/* AmountKeypad (§15.7) : clavier numérique, cibles 48 px minimum. */
function AmountKeypad({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "00", "eff"];
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Clavier du montant">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (k === "eff") onChange("");
            else if (value.length < 7) onChange(value + k);
          }}
          className="font-display flex h-[52px] items-center justify-center rounded-lg border border-line bg-surface text-lg font-semibold text-ink transition-colors hover:bg-[#EDF2F7] active:bg-[#EDF2F7] disabled:opacity-40"
        >
          {k === "eff" ? "eff" : k}
        </button>
      ))}
    </div>
  );
}

/** Clé locale « YYYY-MM-DD ». */
function todayKey(): string {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/** Parse « YYYY-MM-DD » en date locale (sans décalage de fuseau). */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** « sam. 17 oct. » */
function formatDayShort(iso: string): string {
  return parseDay(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

/* ── Puce de journée ── */
function DayChip({
  iso,
  net,
  dailyAmount,
  isToday,
  selected,
  onToggle,
}: {
  iso: string;
  net: number;
  dailyAmount: number;
  isToday: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const remaining = Math.max(0, dailyAmount - net);
  const covered = remaining === 0;
  const partial = net > 0 && remaining > 0;
  return (
    <button
      type="button"
      disabled={covered}
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`${formatDayShort(iso)}${covered ? ", journée déjà couverte" : partial ? `, il reste ${formatFCFA(remaining)}` : ""}`}
      className={cn(
        "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-center transition-colors",
        covered && "cursor-default border-line bg-[#EDF2F7] text-subtle",
        !covered && !selected && "border-line bg-surface text-ink hover:border-primary/40 hover:bg-[#F0F5FC]",
        selected && "border-primary bg-primary text-primary-foreground",
        isToday && !covered && !selected && "border-[#FFB800] bg-[#FFF7E0]",
        isToday && selected && "ring-2 ring-[#FFB800] ring-offset-1"
      )}
    >
      <span className="text-xs font-semibold leading-none">
        {isToday ? "Aujourd'hui" : formatDayShort(iso)}
      </span>
      {covered ? (
        <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium leading-none", selected ? "text-primary-foreground" : "text-primary")}>
          <Check className="h-3 w-3" aria-hidden /> couvert
        </span>
      ) : partial ? (
        <span className={cn("amount text-[10px] font-medium leading-none", selected ? "text-primary-foreground/90" : "text-primary")}>
          reste {formatFCFA(remaining)}
        </span>
      ) : (
        <span className={cn("amount text-[10px] leading-none", selected ? "text-primary-foreground/80" : "text-subtle")}>
          {formatFCFA(dailyAmount)}
        </span>
      )}
    </button>
  );
}

export function CollectScreen({
  tour,
  stop,
  online,
  pendingCount,
  onCollect,
  onSelectStop,
  loading,
}: {
  tour: TourData | null;
  stop: TourStop | null;
  online: boolean;
  pendingCount: number;
  onCollect: (stop: TourStop, allocations: CollectAllocation[]) => void;
  onSelectStop: (stop: TourStop) => void;
  loading: boolean;
}) {
  const [amountInput, setAmountInput] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null); // null = sélection par défaut (aujourd'hui)

  const view = useMemo(() => {
    if (!stop) return null;
    const tKey = todayKey();
    const netOf = new Map(stop.days.map((d) => [d.date, d.net]));
    const remaining = (iso: string) => Math.max(0, stop.dailyAmount - (netOf.get(iso) ?? 0));
    const payable = stop.days.filter((d) => remaining(d.date) > 0).map((d) => d.date);
    const missed = payable.filter((iso) => iso < tKey);
    const todayPayable = payable.includes(tKey);
    const future = payable.filter((iso) => iso > tKey);
    return { tKey, netOf, remaining, payable, missed, todayPayable, future };
  }, [stop]);

  // Sélection effective : aujourd'hui par défaut, sinon choix explicite.
  const effectiveSelected = useMemo(() => {
    if (!view) return [];
    if (selected !== null) return selected;
    return view.todayPayable ? [view.tKey] : [];
  }, [selected, view]);

  const suggestedTotal = useMemo(
    () => effectiveSelected.reduce((s, iso) => s + (view?.remaining(iso) ?? 0), 0),
    [effectiveSelected, view]
  );

  const amount = amountInput === null ? suggestedTotal : parseInt(amountInput || "0", 10) || 0;

  // Allocation : remplit les journées sélectionnées dans l'ordre, la dernière peut être partielle.
  const allocations = useMemo<CollectAllocation[]>(() => {
    if (!view) return [];
    let left = amount;
    const out: CollectAllocation[] = [];
    for (const iso of effectiveSelected) {
      const take = Math.min(view.remaining(iso), left);
      if (take > 0) out.push({ date: iso, amount: take });
      left -= take;
    }
    return out;
  }, [amount, effectiveSelected, view]);

  const cycleTotal = (stop?.dailyAmount ?? 0) * (stop?.cycleDays ?? 0);
  const overMax = stop !== null && amount > cycleTotal - stop.balance;
  const unallocated = amount > suggestedTotal; // trop de montant pour les journées choisies
  const canSubmit =
    stop !== null && allocations.length > 0 && amount > 0 && !overMax && !unallocated;

  if (loading && !tour) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[52px] w-full rounded-lg" />)}
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }
  if (!tour) return null;

  // Aucun carnet sélectionné : liste rapide des arrêts restants (« 2 touches »).
  if (!stop || !view) {
    const remaining = tour.stops.filter((s) => s.collectedToday === null);
    return (
      <div>
        <h2 className="font-display mb-1 text-lg font-bold text-ink">Encaisser</h2>
        <p className="mb-4 text-sm text-subtle">
          {remaining.length > 0
            ? `${remaining.length} client${remaining.length > 1 ? "s" : ""} à encaisser aujourd'hui.`
            : "Tous tes clients du jour sont encaissés."}
        </p>
        <div className="space-y-3">
          {remaining.map((s) => (
            <button
              key={s.passbookId}
              onClick={() => { setAmountInput(null); setSelected(null); onSelectStop(s); }}
              className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-[#F0F5FC]"
            >
              <span className="amount font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EDF2F7] text-sm font-bold text-ink" aria-hidden>
                {s.passbookNumber}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{s.contributorName}</p>
                <p className="mt-0.5 text-xs text-subtle">
                  {s.neighborhood} · Jour {s.dayIndex}/{s.cycleDays} · {formatFCFA(s.dailyAmount)}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-subtle" aria-hidden />
            </button>
          ))}
          {remaining.length === 0 && (
            <Card className="border-line">
              <CardContent className="p-8 text-center">
                <p className="text-sm text-subtle">Reviens demain, ou rouvre un carnet depuis la tournée.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  const toggleDay = (iso: string) => {
    setSelected((prev) => {
      const base = prev ?? (view.todayPayable ? [view.tKey] : []);
      const next = base.includes(iso) ? base.filter((d) => d !== iso) : [...base, iso].sort();
      return next;
    });
    setAmountInput(null);
  };

  const reset = () => {
    setAmountInput(null);
    setSelected(null);
  };

  const fullDays = allocations.filter((a) => a.amount >= (view.remaining(a.date) || a.amount)).length;

  return (
    <div>
      {/* En-tête du carnet */}
      <Card className="border-line">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-subtle">Carnet {stop.passbookNumber}</p>
              <p className="font-display mt-0.5 text-xl font-bold text-ink">{stop.contributorName}</p>
              <p className="mt-0.5 text-sm text-subtle">
                Jour {stop.dayIndex} sur {stop.cycleDays} · {stop.neighborhood}
              </p>
            </div>
            <PassbookStatusBadge status={stop.status} />
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-[#F4F7FB] px-3 py-2.5">
            <span className="text-sm text-subtle">Solde cumulé</span>
            <span className="amount text-base font-semibold text-ink">{formatFCFA(stop.balance)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between px-1">
            <span className="text-xs text-subtle">Jours payés : {stop.paidDays} · Manqués : {stop.missedDays}</span>
            {stop.collectedToday && (
              <span className="text-xs font-semibold text-success">
                + {formatFCFA(stop.collectedToday.amount)} aujourd'hui
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Sélecteur de journées : le cœur du multi-jours ── */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="text-xs font-medium uppercase tracking-wide text-subtle">
            Journées à régler
          </Label>
          <button
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
            onClick={reset}
          >
            <RotateCcw className="h-3 w-3" aria-hidden /> Réinitialiser
          </button>
        </div>

        {view.payable.length === 0 ? (
          <Card className="border-line bg-[#F4F7FB]">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-subtle">
              <Check className="h-4 w-4 text-primary" aria-hidden />
              Cycle entièrement réglé : toutes les journées sont couvertes.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3" role="group" aria-label="Journées couvrables du cycle">
            {/* Rattrapage des jours manqués */}
            {view.missed.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger">
                  <RotateCcw className="h-3 w-3" aria-hidden /> Rattrapage · {view.missed.length} jour{view.missed.length > 1 ? "s" : ""} manqué{view.missed.length > 1 ? "s" : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {view.missed.map((iso) => (
                    <DayChip
                      key={iso}
                      iso={iso}
                      net={view.netOf.get(iso) ?? 0}
                      dailyAmount={stop.dailyAmount}
                      isToday={false}
                      selected={effectiveSelected.includes(iso)}
                      onToggle={() => toggleDay(iso)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Aujourd'hui (même déjà couvert : visible et verrouillé) */}
            {stop.days.some((d) => d.date === view.tKey) && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Aujourd'hui</p>
                <div className="flex flex-wrap gap-1.5">
                  <DayChip
                    iso={view.tKey}
                    net={view.netOf.get(view.tKey) ?? 0}
                    dailyAmount={stop.dailyAmount}
                    isToday
                    selected={effectiveSelected.includes(view.tKey)}
                    onToggle={() => toggleDay(view.tKey)}
                  />
                </div>
              </div>
            )}

            {/* Journées à venir : autant que le cycle comporte de jours restants */}
            {view.future.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                  <CalendarClock className="h-3 w-3" aria-hidden /> Journées à venir · payer plusieurs jours d'avance
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {view.future.map((iso) => (
                    <DayChip
                      key={iso}
                      iso={iso}
                      net={view.netOf.get(iso) ?? 0}
                      dailyAmount={stop.dailyAmount}
                      isToday={false}
                      selected={effectiveSelected.includes(iso)}
                      onToggle={() => toggleDay(iso)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Montant : 40 px, chiffres tabulaires (§15.4) */}
      <div className="mt-4">
        <Label className="text-xs font-medium uppercase tracking-wide text-subtle">Montant</Label>
        <div
          className={cn(
            "amount font-display mt-1 flex h-16 items-center justify-center rounded-lg border-2 text-[40px] font-bold leading-none",
            overMax || unallocated ? "border-danger bg-[#FDECEA] text-danger" : "border-primary bg-[#EEF4FD] text-primary"
          )}
          role="status"
          aria-live="polite"
        >
          {formatFCFA(amount)}
        </div>
        <div className="mt-2 flex min-h-[20px] items-center justify-between">
          <p className="text-xs text-subtle">
            {effectiveSelected.length > 0
              ? `${effectiveSelected.length} journée${effectiveSelected.length > 1 ? "s" : ""} × ${formatFCFA(stop.dailyAmount)} · reste du cycle : ${formatFCFA(Math.max(0, cycleTotal - stop.balance))}`
              : `Mise du jour : ${formatFCFA(stop.dailyAmount)} · reste du cycle : ${formatFCFA(Math.max(0, cycleTotal - stop.balance))}`}
          </p>
        </div>
      </div>

      {/* Répartition du montant sur les journées choisies */}
      {allocations.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-[#F4F7FB] px-3 py-2.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">Répartition</p>
          <ul className="space-y-1">
            {allocations.map((a) => {
              const rem = view.remaining(a.date);
              const partialDay = a.amount < rem;
              return (
                <li key={a.date} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ink">
                    {a.date === view.tKey ? "Aujourd'hui" : formatDayShort(a.date)}
                    {a.date > view.tKey && <span className="ml-1 font-medium text-primary/80">d'avance</span>}
                    {a.date < view.tKey && <span className="ml-1 font-medium text-danger/80">rattrapage</span>}
                  </span>
                  <span className={cn("amount font-semibold", partialDay ? "text-warning" : "text-ink")}>
                    {formatFCFA(a.amount)}{partialDay && " (partiel)"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Messages d'erreur de validation */}
      <div className="mt-3 space-y-1.5">
        {unallocated && (
          <p className="text-xs font-medium text-danger" role="alert">
            Montant supérieur aux journées sélectionnées. Sélectionne davantage de journées à venir.
          </p>
        )}
        {overMax && (
          <p className="text-xs font-medium text-danger" role="alert">
            Montant supérieur au restant du cycle ({formatFCFA(Math.max(0, cycleTotal - stop.balance))}).
          </p>
        )}
        {effectiveSelected.length === 0 && amount > 0 && (
          <p className="text-xs font-medium text-warning" role="alert">
            Choisis au moins une journée pour attribuer l'encaissement.
          </p>
        )}
      </div>

      {/* Clavier numérique */}
      <div className="mt-4">
        <AmountKeypad
          value={amountInput ?? ""}
          onChange={(v) => setAmountInput(v)}
          disabled={false}
        />
      </div>

      {/* Bouton Encaisser pleine largeur */}
      <Button
        disabled={!canSubmit}
        onClick={() => {
          onCollect(stop, allocations);
          setAmountInput(null);
          setSelected(null);
        }}
        className="mt-5 flex h-14 w-full flex-col items-center justify-center gap-0.5 bg-primary text-base font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        <span className="amount inline-flex items-center gap-2">
          <Wallet className="h-5 w-5" aria-hidden />
          Encaisser {formatFCFA(amount)}
        </span>
        {allocations.length > 1 && (
          <span className="text-[11px] font-medium text-primary-foreground/80">
            {allocations.length} journées · du {formatDayShort(allocations[0].date)} au {formatDayShort(allocations[allocations.length - 1].date)}
          </span>
        )}
      </Button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-subtle">
        <Link2 className="h-3.5 w-3.5 tontihelm-icon" aria-hidden />
        {online
          ? `Carnet du cotisant mis à jour à la synchronisation — visible sur son lien.`
          : "Enregistré sur ton téléphone : le carnet du cotisant se met à jour à l'envoi."}
      </p>
      <div className="mt-2 flex justify-center">
        <SyncStatusPill state={online ? (pendingCount > 0 ? "pending" : "synced") : "offline"} pendingCount={pendingCount} />
      </div>
    </div>
  );
}
