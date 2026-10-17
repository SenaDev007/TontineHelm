"use client";
// TontiHelm — vue « livret annuel » : 12 feuilles mensuelles + la 13e feuille de
// récapitulatif (2026-10). Chaque feuille porte 31 lignes ; la 31e est la mise
// de l'ENTREPRISE : elle est marquée (badge), aucune inscription ne s'y écrit.
// Chaque feuille expose les champs AVANCE (versé au-delà des jours échus) et
// RESTE (attendu − encaissé), recalculés dynamiquement par le serveur.
// Les lignes antérieures au jour d'ARRIVÉE du cotisant sont excusées : jamais
// en retard avant la date où il a commencé.
import { useEffect, useMemo, useState } from "react";
import { AdvanceOption, LivretData, LivretSheet, formatFCFA } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  BookOpenCheck, Building2, CalendarCheck2, CalendarOff, ChevronLeft, ChevronRight,
  CircleDollarSign, Landmark, PiggyBank, TrendingUp, Wallet,
} from "lucide-react";

const SHEET_DAYS = 31;
const COMPANY_LINE = 31;

function SheetStats({ sheet }: { sheet: LivretSheet }) {
  const leftToCover = Math.max(0, sheet.payable - sheet.coveredLines);
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
          <CalendarCheck2 className="h-3 w-3" aria-hidden /> Attendu (mois)
        </p>
        <p className="amount mt-0.5 text-sm font-bold text-ink">{formatFCFA(sheet.attendu)}</p>
        <p className="amount mt-0.5 text-[10px] text-subtle">
          {sheet.payable} mises{sheet.excused > 0 ? ` · ${sheet.excused} avant arrivée` : ""}
        </p>
      </div>
      <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
          <CircleDollarSign className="h-3 w-3" aria-hidden /> Encaissé
        </p>
        <p className="amount mt-0.5 text-sm font-bold text-ink">{formatFCFA(sheet.encaisse)}</p>
        <p className="amount mt-0.5 text-[10px] text-subtle">
          {sheet.coveredLines}/{sheet.payable} lignes
          {sheet.elapsedLines > 0 ? ` · ${sheet.elapsedLines} échues` : ""}
        </p>
      </div>
      <div className="rounded-lg bg-[#FFF4D6] px-3 py-2.5">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#A66A00]">
          <TrendingUp className="h-3 w-3" aria-hidden /> Avance
        </p>
        <p className="amount mt-0.5 text-sm font-bold text-[#A66A00]">{formatFCFA(sheet.avance)}</p>
        <p className="mt-0.5 text-[10px] text-[#A66A00]/80">
          {sheet.avance > 0 ? "versé par anticipation" : "aucune avance"}
        </p>
      </div>
      <div className="rounded-lg bg-[#E8F1FD] px-3 py-2.5">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
          <Wallet className="h-3 w-3" aria-hidden /> Reste
        </p>
        <p className="amount mt-0.5 text-sm font-bold text-primary">{formatFCFA(sheet.reste)}</p>
        <p className="amount mt-0.5 text-[10px] text-subtle">
          {leftToCover} ligne{leftToCover > 1 ? "s" : ""} à couvrir
        </p>
      </div>
    </div>
  );
}

/** Grille des 31 lignes d'une feuille — la 31e porte le marquage ENTREPRISE,
 *  les lignes d'avant l'arrivée du cotisant sont excusées (non dues). */
function SheetGrid({ sheet, dueInSheet }: { sheet: LivretSheet; dueInSheet: number | null }) {
  const lines = Array.from({ length: SHEET_DAYS }, (_, i) => i + 1);
  const partialLine = sheet.partial > 0 ? sheet.excused + sheet.coveredLines + 1 : -1;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5" role="img" aria-label={`Feuille ${sheet.label} : ${sheet.coveredLines} lignes couvertes sur ${sheet.payable}${sheet.excused > 0 ? `, ${sheet.excused} avant l'arrivée` : ""}`}>
        {lines.map((n) => {
          const isCompany = n === COMPANY_LINE;
          const excused = n <= sheet.excused;
          const covered = !excused && n <= sheet.excused + sheet.coveredLines;
          const partial = n === partialLine;
          const due = dueInSheet === n && !covered && !partial;
          return (
            <div
              key={n}
              title={
                isCompany
                  ? "31e mise — elle revient à l'entreprise : aucune inscription ne s'écrit sur cette ligne"
                  : excused
                    ? `Ligne ${n} — avant l'arrivée du cotisant : non due`
                    : covered
                      ? `Ligne ${n} versée`
                      : partial
                        ? `Ligne ${n} partiellement versée (${formatFCFA(sheet.partial)})`
                        : due
                          ? `Ligne ${n} — prochaine ligne due`
                          : `Ligne ${n}`
              }
              className={cn(
                "flex h-11 flex-col items-center justify-center rounded-lg border text-[12px] font-semibold leading-none",
                isCompany && "border-primary/50 bg-[#EEF4FD] text-primary",
                excused && !isCompany && "border-dashed border-line bg-white text-subtle/50 line-through",
                !excused && !isCompany && covered && "border-[#9ED9D3] bg-[#DFF6F4] text-[#00806B]",
                !excused && !isCompany && partial && "border-[#F0D48A] bg-[#FFF4D6] text-[#A66A00]",
                !excused && !isCompany && due && !covered && "border-[#FFB800] bg-[#FFF7E0] text-ink",
                !excused && !isCompany && !covered && !partial && !due && "border-line bg-[#F4F7FB] text-subtle"
              )}
            >
              {isCompany ? (
                <>
                  <Building2 className="h-4 w-4" aria-hidden />
                  <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide">Entreprise</span>
                </>
              ) : excused ? (
                <span className="amount text-[13px] opacity-70">{n}</span>
              ) : (
                <>
                  <span className="amount text-[13px]">{n}</span>
                  {partial ? (
                    <span className="amount mt-0.5 text-[9px] font-medium">{formatFCFA(sheet.partial)}</span>
                  ) : covered ? (
                    <span className="mt-0.5 text-[9px] font-medium opacity-80">versée</span>
                  ) : due ? (
                    <span className="mt-0.5 text-[9px] font-medium text-[#8a6100]">due</span>
                  ) : (
                    <span className="mt-0.5 text-[9px] font-medium opacity-60">&nbsp;</span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-subtle">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-[#9ED9D3] bg-[#DFF6F4]" aria-hidden /> Versée</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-[#F0D48A] bg-[#FFF4D6]" aria-hidden /> Partielle</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-line bg-[#F4F7FB]" aria-hidden /> À venir</span>
        {sheet.excused > 0 && (
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-line bg-white" aria-hidden /> Avant ton arrivée (non due)</span>
        )}
        <span className="flex items-center gap-1.5"><span className="flex h-3 w-3 items-center justify-center rounded border border-primary/50 bg-[#EEF4FD]"><Building2 className="h-2 w-2 text-primary" aria-hidden /></span> 31e mise : entreprise</span>
      </div>
    </div>
  );
}

/** 13e feuille — récapitulatif annuel du livret. */
function RecapSheet({ livret }: { livret: LivretData }) {
  const r = livret.recap;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/30 bg-[#EEF4FD] p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-primary">
          <BookOpenCheck className="h-4 w-4" aria-hidden /> 13e feuille — Récapitulatif annuel
        </p>
        <p className="mt-1 text-xs leading-relaxed text-subtle">
          Le livret compte 12 feuilles mensuelles de 31 mises. Sur chaque feuille, la 31e mise revient à
          l&apos;entreprise : {formatFCFA(r.mise)} × 12 = <span className="amount font-semibold text-ink">{formatFCFA(12 * r.mise)}</span> sur l&apos;année.
          {livret.excusedLines > 0 && (
            <>
              {" "}Arrivée en cours de mois : {livret.excusedLines} ligne{livret.excusedLines > 1 ? "s" : ""} d&apos;avant
              ton arrivée ne sont pas dues — l&apos;attendu est proratisé.
            </>
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
            <CircleDollarSign className="h-3 w-3" aria-hidden /> Mise journalière
          </p>
          <p className="amount mt-0.5 text-sm font-bold text-ink">{formatFCFA(r.mise)}</p>
        </div>
        <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
            <CalendarCheck2 className="h-3 w-3" aria-hidden /> Total attendu
          </p>
          <p className="amount mt-0.5 text-sm font-bold text-ink">{formatFCFA(r.attendu)}</p>
          <p className="amount mt-0.5 text-[10px] text-subtle">{livret.payableLines} lignes encaissables</p>
        </div>
        <div className="rounded-lg bg-[#DFF6F4] px-3 py-2.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#00806B]">
            <PiggyBank className="h-3 w-3" aria-hidden /> Ce que tu as réuni
          </p>
          <p className="amount mt-0.5 text-sm font-bold text-[#00806B]">{formatFCFA(r.encaisse)}</p>
          <p className="amount mt-0.5 text-[10px] text-subtle">{r.sheetsComplete}/12 feuilles complètes</p>
        </div>
        <div className="rounded-lg bg-[#EEF4FD] px-3 py-2.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <Building2 className="h-3 w-3" aria-hidden /> Revient à l&apos;entreprise
          </p>
          <p className="amount mt-0.5 text-sm font-bold text-primary">{formatFCFA(r.partEntreprise)}</p>
          <p className="mt-0.5 text-[10px] text-subtle">31es mises (1 par feuille)</p>
        </div>
        <div className="rounded-lg bg-[#E8F1FD] px-3 py-2.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <Landmark className="h-3 w-3" aria-hidden /> Te revient (à récupérer)
          </p>
          <p className="amount mt-0.5 text-sm font-bold text-primary">{formatFCFA(r.partClient)}</p>
          <p className="mt-0.5 text-[10px] text-subtle">réuni − part entreprise</p>
        </div>
        <div className="rounded-lg bg-[#FFF4D6] px-3 py-2.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#A66A00]">
            <TrendingUp className="h-3 w-3" aria-hidden /> Avance totale
          </p>
          <p className="amount mt-0.5 text-sm font-bold text-[#A66A00]">{formatFCFA(r.avanceTotale)}</p>
          <p className="mt-0.5 text-[10px] text-[#A66A00]/80">
            {r.avanceTotale > 0 && livret.coveredThrough ? `couvre jusqu'à fin ${livret.coveredThrough.label}` : "aucune avance"}
          </p>
        </div>
        <div className="rounded-lg bg-[#E8F1FD] px-3 py-2.5 sm:col-span-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <Wallet className="h-3 w-3" aria-hidden /> Reste à verser
          </p>
          <p className="amount mt-0.5 text-sm font-bold text-primary">{formatFCFA(r.reste)}</p>
          <p className="mt-0.5 text-[10px] text-subtle">attendu − encaissé</p>
        </div>
      </div>
      {r.missedLines > 0 && (
        <p className="rounded-lg bg-[#FDECEA] p-3 text-xs font-medium text-[#B3261E]">
          {r.missedLines} ligne{r.missedLines > 1 ? "s" : ""} échue{r.missedLines > 1 ? "s" : ""} non couverte{r.missedLines > 1 ? "s" : ""} —
          passe voir ton agent pour régulariser.
        </p>
      )}
    </div>
  );
}

/** Bandeau « avance du cotisant » : ce qu'il a pris d'avance et ce qu'il reste à prendre. */
function AdvanceBanner({ livret }: { livret: LivretData }) {
  const r = livret.recap;
  if (r.avanceTotale <= 0) return null;
  return (
    <div className="rounded-xl border border-[#F0D48A] bg-[#FFFCF2] p-3.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-[#7A5400]">
        <TrendingUp className="h-4 w-4 shrink-0 text-[#A66A00]" aria-hidden />
        <span>
          <b>Avance du cotisant :</b>{" "}
          <span className="amount font-semibold">{formatFCFA(r.avanceTotale)}</span> versés par anticipation
          {livret.coveredThrough ? (
            <>
              {" "}— ses versements couvrent jusqu&apos;à <b>fin {livret.coveredThrough.label}</b>.
            </>
          ) : null}
          {" "}Il lui reste <span className="amount font-semibold">{formatFCFA(r.reste)}</span> à prendre
          {r.reste > 0 ? " sur la suite du livret." : " : le livret est entièrement réglé."}
        </span>
      </p>
    </div>
  );
}

/** Note d'arrivée : jamais en retard avant la date où le cotisant a commencé. */
function ArrivalNote({ livret }: { livret: LivretData }) {
  if (livret.excusedLines <= 0) return null;
  const arrived = new Date(`${livret.effectiveStart}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
  return (
    <p className="flex items-start gap-2 rounded-lg border border-line bg-[#F4F7FB] p-3 text-xs leading-relaxed text-subtle">
      <CalendarOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        Cotisant arrivé le <b className="text-ink">{arrived}</b>, en cours de mois : les{" "}
        <b className="text-ink">{livret.excusedLines}</b> lignes d&apos;avant son arrivée (grisées, barrées) ne sont
        pas dues — le retard ne court qu&apos;à partir de la date où il a commencé, et l&apos;attendu du mois d&apos;arrivée
        est proratisé ({livret.payableLines} lignes encaissables sur le livret).
      </span>
    </p>
  );
}

export function LivretSheets({
  livret,
  carnetTitle,
  compact = false,
}: {
  livret: LivretData;
  carnetTitle?: string;
  compact?: boolean;
}) {
  // Vue affichée : "sheet" = feuille mensuelle (par défaut celle du mois en
  // cours — « c'est par là qu'on commence »), "recap" = 13e feuille.
  const [view, setView] = useState<"sheet" | "recap">("sheet");
  const [sheetIdx, setSheetIdx] = useState<number | null>(null);

  // Nouveau livret (changement de carnet) : retour à la feuille en cours.
  useEffect(() => {
    setView("sheet");
    setSheetIdx(null);
  }, [livret]);

  const effectiveIdx = sheetIdx ?? livret.currentSheet;
  const sheet = livret.sheets[effectiveIdx - 1];
  const isRecap = view === "recap";

  // Ligne due : position ABSOLUE dans le livret — seulement sur sa feuille.
  const dueInfo = useMemo(() => {
    if (livret.lineDue > SHEET_DAYS * livret.months) return null;
    const dueSheet = Math.ceil(livret.lineDue / SHEET_DAYS);
    return { sheet: dueSheet, lineInSheet: ((livret.lineDue - 1) % SHEET_DAYS) + 1 };
  }, [livret]);
  const dueInSheet = !isRecap && dueInfo?.sheet === effectiveIdx ? (dueInfo?.lineInSheet ?? null) : null;

  const chips = useMemo(
    () => livret.sheets.map((s) => ({ index: s.index, label: s.shortLabel, current: s.current, complete: s.complete })),
    [livret]
  );

  return (
    <div className="space-y-3.5">
      {carnetTitle && (
        <div className="flex items-center justify-between gap-2">
          <p className="amount font-display text-base font-bold text-ink">{carnetTitle}</p>
          <p className="text-xs text-subtle">
            Commencé le{" "}
            {new Date(`${livret.effectiveStart}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      )}

      <ArrivalNote livret={livret} />
      <AdvanceBanner livret={livret} />

      {/* Sélecteur des 13 feuilles : 12 mois + récapitulatif */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Feuilles du livret">
        {chips.map((c) => (
          <button
            key={c.index}
            role="tab"
            aria-selected={!isRecap && effectiveIdx === c.index}
            onClick={() => { setView("sheet"); setSheetIdx(c.index); }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              !isRecap && effectiveIdx === c.index
                ? "border-primary bg-primary text-primary-foreground"
                : c.complete
                  ? "border-[#9ED9D3] bg-[#DFF6F4] text-[#00806B] hover:border-primary/40"
                  : c.current
                    ? "border-[#FFB800] bg-[#FFF7E0] text-ink hover:border-primary/40"
                    : "border-line bg-white text-subtle hover:border-primary/40 hover:text-ink"
            )}
          >
            <span className="hidden sm:inline">F{c.index}</span>
            {c.label}
          </button>
        ))}
        <button
          role="tab"
          aria-selected={isRecap}
          onClick={() => setView("recap")}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
            isRecap
              ? "border-primary bg-primary text-primary-foreground"
              : "border-primary/40 bg-[#EEF4FD] text-primary hover:border-primary"
          )}
        >
          <BookOpenCheck className="h-3.5 w-3.5" aria-hidden /> Récap (13e)
        </button>
      </div>

      {isRecap ? (
        <RecapSheet livret={livret} />
      ) : (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-display text-sm font-bold text-ink">
                {sheet.index}
                <span className="text-subtle">/12</span> · {sheet.label}
              </p>
              <p className="text-xs text-subtle">
                {sheet.coveredLines}/{sheet.payable} lignes couvertes
                {sheet.elapsedLines > 0 ? ` · ${sheet.elapsedLines} échues à ce jour` : ""}
                {sheet.complete && " — feuille complète"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setView("sheet"); setSheetIdx(Math.max(1, effectiveIdx - 1)); }}
                disabled={effectiveIdx <= 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-subtle transition-colors hover:text-ink disabled:opacity-30"
                aria-label="Feuille précédente"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                onClick={() => { setView("sheet"); setSheetIdx(Math.min(livret.months, effectiveIdx + 1)); }}
                disabled={effectiveIdx >= livret.months}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-subtle transition-colors hover:text-ink disabled:opacity-30"
                aria-label="Feuille suivante"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          {!compact && <SheetStats sheet={sheet} />}
          <SheetGrid sheet={sheet} dueInSheet={dueInSheet} />
        </div>
      )}
    </div>
  );
}

export type { AdvanceOption };
