"use client";
// TontiHelm — carnet public du cotisant (consultation par lien personnel).
// Le cotisant ouvre ce lien depuis WhatsApp ou son e-mail : il voit son carnet,
// chaque journée versée, son solde et l'évolution de sa tontine — à tout moment,
// sans compte ni code. Les données se rafraîchissent automatiquement.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoMark } from "@/components/tontihelm/Logo";
import { get } from "@/lib/client";
import { PublicCarnetData, formatFCFA } from "@/lib/types";
import {
  AlertCircle, CalendarCheck2, CircleDollarSign, Clock3, RefreshCw,
  ShieldCheck, TrendingUp, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DayCell = {
  date: string;
  dayIndex: number;
  net: number;
  state: "paid" | "partial" | "missed" | "future";
};

function buildCells(pb: PublicCarnetData["passbooks"][number]): DayCell[] {
  const today = new Date();
  const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return pb.days.map((d, i) => {
    const cellDate = new Date(`${d.date}T00:00:00.000Z`).getTime();
    const isPast = cellDate <= todayStart;
    let state: DayCell["state"] = "future";
    if (d.net >= pb.dailyAmount) state = "paid";
    else if (d.net > 0) state = "partial";
    else if (isPast) state = "missed";
    return { date: d.date, dayIndex: i + 1, net: d.net, state };
  });
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === "late"
      ? "border-[#F5C6C0] bg-[#FDECEA] text-[#B3261E]"
      : status === "active"
        ? "border-[#B5E8E5] bg-[#DFF6F4] text-[#00806B]"
        : status === "closed"
          ? "border-line bg-[#EDF2F7] text-subtle"
          : "border-[#F0D48A] bg-[#FFF4D6] text-[#A66A00]";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold", tone)}>
      {status === "late" ? <Clock3 className="h-3.5 w-3.5" aria-hidden /> : status === "active" ? <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden /> : null}
      {label}
    </span>
  );
}

function DayGrid({ pb }: { pb: PublicCarnetData["passbooks"][number] }) {
  const cells = buildCells(pb);
  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <div className="space-y-1.5" role="img" aria-label={`Calendrier du carnet ${pb.number} : ${pb.paidDays} journées versées sur ${pb.cycleDays}`}>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1.5">
          {week.map((c) => (
            <div
              key={c.date}
              title={`${new Date(`${c.date}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}${c.net > 0 ? ` — ${formatFCFA(c.net)} versés` : c.state === "missed" ? " — non versé" : ""}`}
              className={cn(
                "flex h-11 flex-col items-center justify-center rounded-lg border text-[11px] font-semibold leading-none",
                c.state === "paid" && "border-[#9ED9D3] bg-[#DFF6F4] text-[#00806B]",
                c.state === "partial" && "border-[#F0D48A] bg-[#FFF4D6] text-[#A66A00]",
                c.state === "missed" && "border-[#F5C6C0] bg-[#FDECEA] text-[#B3261E]",
                c.state === "future" && "border-line bg-[#F4F7FB] text-subtle"
              )}
            >
              <span className="amount text-[13px]">{c.dayIndex}</span>
              <span className="mt-0.5 text-[9px] font-medium opacity-80">
                {new Date(`${c.date}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-[11px] text-subtle">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-[#9ED9D3] bg-[#DFF6F4]" aria-hidden /> Journée versée</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-[#F0D48A] bg-[#FFF4D6]" aria-hidden /> Versement partiel</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-[#F5C6C0] bg-[#FDECEA]" aria-hidden /> Jour manqué</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-line bg-[#F4F7FB]" aria-hidden /> À venir</span>
      </div>
    </div>
  );
}

export function PublicCarnetScreen({ token }: { token: string }) {
  const [data, setData] = useState<PublicCarnetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const d = await get<PublicCarnetData>(`/api/public/carnets/${token}`);
      setData(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Carnet indisponible. Réessaie.");
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    // Rafraîchissement périodique : le cotisant laisse l'onglet ouvert, les
    // encaissements de l'agent apparaissent sans rechargement manuel.
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* En-tête : structure + cotisant */}
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <LogoMark size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight text-ink">
              {data?.structure.name ?? "TontiHelm"}
            </p>
            <p className="truncate text-xs text-subtle">
              {data ? `Carnet de ${data.contributor.fullName}` : "Carnet de tontine"}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 border-line"
            onClick={load}
            disabled={refreshing}
            aria-label="Actualiser le carnet"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 pb-16">
        {error ? (
          <div className="rounded-xl border border-line bg-white p-8 text-center shadow-sm">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FDECEA]">
              <AlertCircle className="h-7 w-7 text-danger" aria-hidden />
            </span>
            <h1 className="font-display mt-4 text-lg font-bold text-ink">Lien de carnet invalide</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-subtle">
              {error} Si tu as reçu ce lien par WhatsApp ou par e-mail, demande-en un nouveau à ton
              agent de collecte ou à ta structure.
            </p>
            <Button variant="outline" className="mt-5 border-line" onClick={load}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer
            </Button>
          </div>
        ) : !data ? (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : (
          <>
            {data.passbooks.length === 0 && (
              <div className="rounded-xl border border-line bg-white p-8 text-center shadow-sm">
                <p className="font-display text-lg font-bold text-ink">Aucun carnet pour le moment</p>
                <p className="mt-2 text-sm text-subtle">
                  Ton carnet apparaîtra ici dès l&apos;ouverture de ta tontine par la structure.
                </p>
              </div>
            )}

            {data.passbooks.map((pb) => {
              const progress = Math.round((pb.paidDays / pb.cycleDays) * 100);
              return (
                <section key={pb.number} className="mb-5 rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5" aria-label={`Carnet ${pb.number}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="amount font-display text-base font-bold text-ink">Carnet {pb.number}</p>
                      <p className="text-xs text-subtle">
                        Cycle de {pb.cycleDays} jours · commencé le{" "}
                        {new Date(`${pb.startsOn}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    </div>
                    <StatusPill status={pb.status} label={pb.statusLabel} />
                  </div>

                  {/* Progression du cycle */}
                  <div className="mt-4">
                    <div className="flex items-end justify-between text-xs">
                      <span className="font-semibold text-ink">
                        {pb.paidDays} / {pb.cycleDays} journées versées
                      </span>
                      <span className="text-subtle">jour {pb.elapsedDays} du cycle</span>
                    </div>
                    <div
                      className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#EDF2F7]"
                      role="progressbar"
                      aria-valuenow={pb.paidDays}
                      aria-valuemin={0}
                      aria-valuemax={pb.cycleDays}
                      aria-label="Journées versées"
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.min(100, progress)}%` }}
                      />
                    </div>
                  </div>

                  {/* Chiffres clés */}
                  <div className="mt-4 grid grid-cols-3 gap-2.5">
                    <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                        <CircleDollarSign className="h-3 w-3" aria-hidden /> Mise / jour
                      </p>
                      <p className="amount mt-0.5 text-sm font-bold text-ink">{formatFCFA(pb.dailyAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                        <TrendingUp className="h-3 w-3" aria-hidden /> Solde cumulé
                      </p>
                      <p className="amount mt-0.5 text-sm font-bold text-ink">{formatFCFA(pb.balance)}</p>
                    </div>
                    <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                        <XCircle className="h-3 w-3" aria-hidden /> Jours manqués
                      </p>
                      <p className={cn("amount mt-0.5 text-sm font-bold", pb.missedDays > 0 ? "text-danger" : "text-ink")}>
                        {pb.missedDays}
                      </p>
                    </div>
                  </div>

                  {/* Calendrier du cycle */}
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold text-ink">Chaque journée du cycle</p>
                    <DayGrid pb={pb} />
                  </div>

                  <p className="mt-4 rounded-lg bg-[#F4F7FB] p-3 text-xs leading-relaxed text-subtle">
                    Total attendu du cycle : <span className="amount font-semibold text-ink">{formatFCFA(pb.cycleTotal)}</span>
                    {pb.missedDays > 0 && (
                      <> · Passe voir ton agent pour régulariser les jours manqués.</>
                    )}
                  </p>
                </section>
              );
            })}

            <p className="mx-auto max-w-md text-center text-[11px] leading-relaxed text-subtle">
              Mis à jour{" "}
              {data.generatedAt
                ? new Date(data.generatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                : ""}
              {" · "}
              actualisation automatique chaque minute.
              <span className="mt-1 flex items-center justify-center gap-1.5">
                <ShieldCheck className="h-3 w-3" aria-hidden />
                Ce lien est personnel : garde-le précieusement, il reste valable.
              </span>
            </p>
          </>
        )}
      </main>

      <footer className="border-t border-line bg-white py-4">
        <p className="mx-auto max-w-2xl px-4 text-center text-[11px] text-subtle">
          TontiHelm — la tontine journalière, claire pour tous. Une question ? Contacte ta structure
          de collecte.
        </p>
      </footer>
    </div>
  );
}
