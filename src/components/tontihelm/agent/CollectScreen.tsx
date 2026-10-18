"use client";
// TontiHelm — écran d'encaissement du livret annuel (2026-10) :
// les écritures remplissent les lignes du livret SÉQUENTIELLEMENT, comme le
// marquage du carnet papier. La ligne due (la prochaine non couverte) se
// collecte « aujourd'hui » — en retard s'il y a des lignes manquées (rattrapage) ;
// sélectionner des lignes suivantes = payer d'AVANCE (le système calcule le
// reste dynamiquement). La 31e ligne d'une feuille est la mise de l'ENTREPRISE :
// marquée, jamais inscrite.
//
// Mode « Avance » (correction du dirigeant, 2026-10-18) : l'avance n'est PAS
// obligatoirement le montant total du mois couvert — le cotisant peut verser
// juste une PARTIE. L'agent renseigne le montant que le cotisant désire payer
// (pavé numérique) ; les puces de feuille restent des raccourcis qui
// préremplissent le montant total. Le système calcule jusqu'où l'avance
// couvre (rattrapage inclus) et ce qu'il restera à prendre — advancePreview()
// est la MÊME fonction pure que le mobile (packages/domain, source de vérité).
import { useMemo, useState } from "react";
import { advancePreview } from "@domain/livret";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PassbookStatusBadge, SyncStatusPill } from "../StatusBadge";
import { PayableLine, TourData, TourStop, formatFCFA } from "@/lib/types";
import { Building2, Wallet, ChevronRight, Link2, Check, RotateCcw, TrendingUp, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Allocation d'un encaissement : une écriture par ligne du livret. */
export interface CollectAllocation {
  line: number; // ligne absolue du livret (1..372)
  amount: number;
  /** Avance : une seule écriture — totale (feuille entière) ou PARTIELLE. */
  advance?: boolean;
  /** Avance couvrant une feuille ENTIÈRE : libellé « nov. 2026 » (toast). */
  coversThrough?: string;
  /** Avance partielle : « ligne 12 de nov. 2026 » (toast). */
  coversLineLabel?: string;
  /** Ce qu'il restera à prendre après cette avance (notification). */
  resteAfter?: number;
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

/* ── Puce de ligne du livret ── */
function LineChip({
  payable,
  dailyAmount,
  state,
  selected,
  onToggle,
}: {
  payable: PayableLine;
  dailyAmount: number;
  state: "due" | "late" | "advance";
  selected: boolean;
  onToggle: () => void;
}) {
  const label =
    state === "due" ? "Ligne due" : state === "late" ? "Rattrapage" : `+${payable.lineInSheet}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`${payable.company ? "Mise de l'entreprise" : `Ligne ${payable.lineInSheet} de la feuille ${payable.sheet}`} — ${formatFCFA(dailyAmount)}`}
      className={cn(
        "flex min-h-[52px] w-[86px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-center transition-colors",
        selected && "border-primary bg-primary text-primary-foreground",
        !selected && state === "due" && "border-[#FFB800] bg-[#FFF7E0] text-ink hover:border-primary/40",
        !selected && state === "late" && "border-[#F5C6C0] bg-[#FDECEA] text-[#B3261E] hover:border-primary/40",
        !selected && state === "advance" && "border-line bg-surface text-ink hover:border-primary/40 hover:bg-[#F0F5FC]",
        !selected && payable.company && "border-primary/50 bg-[#EEF4FD] text-primary"
      )}
    >
      {payable.company ? (
        <>
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase leading-none">
            <Building2 className="h-3 w-3" aria-hidden /> Entreprise
          </span>
          <span className="amount mt-0.5 text-[10px] font-medium leading-none opacity-80">
            {formatFCFA(dailyAmount)}
          </span>
        </>
      ) : (
        <>
          <span className="text-xs font-semibold leading-none">{label}</span>
          <span className="amount text-[10px] font-medium leading-none opacity-80">
            L{payable.lineInSheet} · {formatFCFA(dailyAmount)}
          </span>
        </>
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
  const [selected, setSelected] = useState<number[] | null>(null); // null = sélection par défaut (ligne due)
  const [mode, setMode] = useState<"lines" | "advance">("lines");
  // Montant d'avance saisi par l'agent (null = preset par défaut : fin du mois
  // en cours, rattrapage inclus). PARTIEL autorisé — décision du dirigeant.
  const [advanceAmount, setAdvanceAmount] = useState<string | null>(null);

  const view = useMemo(() => {
    if (!stop) return null;
    const payable = stop.livret.payable ?? [];
    const due = payable[0] ?? null; // première ligne non couverte = ligne due
    const rest = payable.slice(1);
    const late = stop.livret.missedLines > 0;
    return { payable, due, rest, late };
  }, [stop]);

  // Sélection effective : la ligne due par défaut, sinon choix explicite.
  const effectiveSelected = useMemo(() => {
    if (!view) return [] as number[];
    if (selected !== null) return selected;
    return view.due ? [view.due.line] : [];
  }, [selected, view]);

  const suggestedTotal = useMemo(
    () => effectiveSelected.length * (stop?.dailyAmount ?? 0),
    [effectiveSelected, stop]
  );

  const amount = amountInput === null ? suggestedTotal : parseInt(amountInput || "0", 10) || 0;

  // Allocation : remplit les lignes sélectionnées dans l'ordre (1 mise par ligne,
  // la dernière peut être partielle).
  const allocations = useMemo<CollectAllocation[]>(() => {
    if (!view || !stop || mode !== "lines") return [];
    let left = amount;
    const out: CollectAllocation[] = [];
    for (const line of effectiveSelected) {
      const take = Math.min(stop.dailyAmount, left);
      if (take > 0) out.push({ line, amount: take });
      left -= take;
    }
    return out;
  }, [amount, effectiveSelected, view, stop, mode]);

  // ── Avance (totale ou PARTIELLE) : le système calcule la couverture ──
  // Presets = raccourcis « couvrir jusqu'à fin de feuille » ; le montant saisi
  // au pavé peut être une partie seulement de la feuille visée.
  const advanceOptions = stop?.livret?.advanceOptions ?? [];
  const advanceDefault = advanceOptions[0] ?? null; // fin du mois en cours
  const advanceValue =
    mode === "advance"
      ? advanceAmount === null
        ? (advanceDefault?.amount ?? 0)
        : parseInt(advanceAmount || "0", 10) || 0
      : 0;
  const activePreset = advanceOptions.find((o) => o.amount === advanceValue) ?? null;

  // Aperçu partagé web ↔ mobile (packages/domain) : jusqu'où l'avance couvre,
  // ligne entamée, reste à prendre après l'écriture. cycleDays suit la durée
  // du carnet (§8.14 — 372 par défaut, moins en cycle court).
  const preview = useMemo(() => {
    if (!stop || mode !== "advance") return null;
    return advancePreview(
      {
        dailyAmount: stop.dailyAmount,
        balance: stop.livret.balance,
        coveredLines: stop.livret.coveredLines,
        payableLines: stop.livret.payableLines,
        lineDue: stop.livret.lineDue,
        attendu: stop.livret.recap.attendu,
        sheets: stop.livret.sheets,
        cycleDays: stop.livret.cycleDays,
      },
      advanceValue
    );
  }, [stop, mode, advanceValue]);

  const cycleTotal = stop?.livret?.recap.attendu ?? 0;
  const overMax = mode === "lines" && stop !== null && amount > cycleTotal - stop.balance;
  const unallocated = mode === "lines" && amount > suggestedTotal; // trop de montant pour les lignes choisies
  const advanceExceeds = mode === "advance" && (preview?.exceedsReste ?? false);
  const canSubmit =
    stop !== null &&
    (mode === "advance"
      ? preview !== null && preview.valid && !preview.exceedsReste
      : allocations.length > 0 && amount > 0 && !overMax && !unallocated);

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
              onClick={() => { setAmountInput(null); setSelected(null); setMode("lines"); onSelectStop(s); }}
              className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-[#F0F5FC]"
            >
              <span className="amount font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EDF2F7] text-sm font-bold text-ink" aria-hidden>
                {s.passbookNumber}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{s.contributorName}</p>
                <p className="mt-0.5 text-xs text-subtle">
                  {s.neighborhood} · F{s.livret.currentSheet}/{s.livret.months ?? 12} · L{s.livret.dueLineInSheet} · {formatFCFA(s.dailyAmount)}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-subtle" aria-hidden />
            </button>
          ))}
          {remaining.length === 0 && (
            <Card className="border-line">
              <CardContent className="p-8 text-center">
                <p className="text-sm text-subtle">Reviens demain, ou rouvre un carnet depuis la tournée ou l&apos;onglet Clients.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  const toggleLine = (line: number) => {
    setSelected((prev) => {
      const base = prev ?? (view.due ? [view.due.line] : []);
      const next = base.includes(line) ? base.filter((l) => l !== line) : [...base, line].sort((a, b) => a - b);
      return next;
    });
    setAmountInput(null);
  };

  const reset = () => {
    setAmountInput(null);
    setSelected(null);
    setAdvanceAmount(null);
  };

  const submit = () => {
    if (mode === "advance" && preview && preview.valid && !preview.exceedsReste) {
      const lineInSheet =
        preview.coversThroughLine > 0
          ? ((preview.coversThroughLine - 1) % 31) + 1
          : null;
      onCollect(stop, [{
        line: stop.livret.lineDue,
        amount: preview.amount,
        advance: true,
        ...(preview.coversFullSheet && preview.coversThroughLabel
          ? { coversThrough: preview.coversThroughLabel }
          : {}),
        ...(!preview.coversFullSheet && preview.coversThroughLabel && lineInSheet
          ? { coversLineLabel: `ligne ${lineInSheet} de ${preview.coversThroughLabel}` }
          : {}),
        resteAfter: preview.resteAfter,
      }]);
    } else {
      onCollect(stop, allocations);
    }
    setAmountInput(null);
    setSelected(null);
    setAdvanceAmount(null);
  };

  const sheet = stop.livret.sheet;
  const previewLineInSheet =
    preview && preview.coversThroughLine > 0
      ? ((preview.coversThroughLine - 1) % 31) + 1
      : null;
  const advanceMonths = preview?.coversFullSheet
    ? (preview.coversThroughSheet ?? 0) - stop.livret.currentSheet
    : 0;

  return (
    <div>
      {/* En-tête du carnet */}
      <Card className="border-line">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                Carnet {stop.passbookNumber}{stop.passbookLabel ? ` · ${stop.passbookLabel}` : ""}
              </p>
              <p className="font-display mt-0.5 text-xl font-bold text-ink">{stop.contributorName}</p>
              <p className="mt-0.5 text-sm text-subtle">
                Feuille {sheet.index}/{stop.livret.months ?? 12} ({sheet.label}) · ligne {stop.livret.dueLineInSheet} · {stop.neighborhood}
              </p>
            </div>
            <PassbookStatusBadge status={stop.status} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-lg border border-line bg-[#F4F7FB] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Solde cumulé</p>
              <p className="amount text-sm font-bold text-ink">{formatFCFA(stop.balance)}</p>
            </div>
            <div className="rounded-lg border border-[#F0D48A]/60 bg-[#FFF4D6] px-3 py-2.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#A66A00]">
                <TrendingUp className="h-3 w-3" aria-hidden /> Avance (feuille)
              </p>
              <p className="amount text-sm font-bold text-[#A66A00]">{formatFCFA(sheet.avance)}</p>
            </div>
            <div className="rounded-lg border border-[#B5D4F5] bg-[#E8F1FD] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Reste (feuille)</p>
              <p className="amount text-sm font-bold text-primary">{formatFCFA(sheet.reste)}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between px-1">
            <span className="text-xs text-subtle">
              Lignes couvertes : {stop.livret.coveredLines}/{stop.livret.payableLines}
              {stop.livret.missedLines > 0 && (
                <span className="font-semibold text-danger"> · {stop.livret.missedLines} en retard</span>
              )}
              {stop.livret.excusedLines > 0 && (
                <span> · {stop.livret.excusedLines} avant arrivée</span>
              )}
            </span>
            {stop.collectedToday && (
              <span className="amount text-xs font-semibold text-success">
                + {formatFCFA(stop.collectedToday.amount)} aujourd&apos;hui
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Mode d'encaissement : ligne à ligne, ou avance mensuelle ── */}
      <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-[#F4F7FB] p-1.5" role="tablist" aria-label="Mode d'encaissement">
        <button
          role="tab"
          aria-selected={mode === "lines"}
          onClick={() => setMode("lines")}
          className={cn(
            "flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors",
            mode === "lines" ? "bg-white text-ink shadow-sm" : "text-subtle hover:text-ink"
          )}
        >
          <CalendarClock className="h-4 w-4" aria-hidden /> Ligne à ligne
        </button>
        <button
          role="tab"
          aria-selected={mode === "advance"}
          onClick={() => setMode("advance")}
          className={cn(
            "flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors",
            mode === "advance" ? "bg-white text-ink shadow-sm" : "text-subtle hover:text-ink"
          )}
        >
          <TrendingUp className="h-4 w-4" aria-hidden /> Avance
        </button>
      </div>

      {mode === "advance" ? (
        /* ── Avance totale ou PARTIELLE : le cotisant paie d'avance ──
           Les puces « Ce mois / +1 mois… » préremplissent le montant TOTAL de
           la feuille ; l'agent saisit ensuite le montant que le cotisant veut
           VRAIMENT verser — une partie suffit (décision du dirigeant). */
        <div className="mt-4">
          <p className="mb-1.5 text-xs leading-relaxed text-subtle">
            {stop.contributorName} décide de payer d&apos;avance ? Saisis le montant qu&apos;il désire verser —
            le total d&apos;une feuille (raccourci ci-dessous) ou juste une partie. Le système calcule
            jusqu&apos;où l&apos;avance couvre et ce qu&apos;il restera à prendre.
          </p>

          {advanceOptions.length === 0 ? (
            <Card className="border-line bg-[#F4F7FB]">
              <CardContent className="flex items-center gap-2 p-4 text-sm text-subtle">
                <Check className="h-4 w-4 text-primary" aria-hidden />
                Livret entièrement réglé : aucune avance possible.
              </CardContent>
            </Card>
          ) : (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1.5" role="tablist" aria-label="Raccourcis d'avance (fin de feuille)">
              {advanceOptions.map((o) => {
                const months = o.sheet - stop.livret.currentSheet;
                const isActive = activePreset?.sheet === o.sheet;
                return (
                  <button
                    key={o.sheet}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setAdvanceAmount(String(o.amount))}
                    className={cn(
                      "flex h-[52px] w-[92px] shrink-0 flex-col items-center justify-center rounded-lg border transition-colors",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-line bg-surface text-ink hover:border-primary/40 hover:bg-[#F0F5FC]"
                    )}
                  >
                    <span className="text-xs font-semibold leading-none">
                      {months === 0 ? "Ce mois" : `+${months} mois`}
                    </span>
                    <span className="mt-1 text-[10px] font-medium leading-none opacity-75">{o.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Montant de l'avance : saisi par l'agent (une PARTIE suffit) */}
          <div className="mt-3">
            <Label htmlFor="advance-montant" className="text-xs font-medium uppercase tracking-wide text-subtle">
              Montant que le cotisant veut payer
            </Label>
            <div
              id="advance-montant"
              className={cn(
                "amount font-display mt-1 flex h-16 items-center justify-center rounded-lg border-2 text-[40px] font-bold leading-none",
                advanceExceeds
                  ? "border-danger bg-[#FDECEA] text-danger"
                  : "border-[#F0D48A] bg-[#FFF4D6] text-[#A66A00]"
              )}
              role="status"
              aria-live="polite"
            >
              {formatFCFA(advanceValue)}
            </div>
          </div>

          {/* Aperçu : jusqu'où l'avance couvre et reste à prendre */}
          {preview && preview.valid && !preview.exceedsReste && (
            <p className="mt-2 rounded-lg border border-[#F0D48A]/60 bg-[#FFFCF2] px-3 py-2.5 text-xs leading-relaxed text-[#7A5400]">
              {preview.coversFullSheet ? (
                <>
                  L&apos;avance règle tout ce qui est dû et couvre jusqu&apos;à <b>fin {preview.coversThroughLabel}</b>
                  {advanceMonths > 0 ? ` (${advanceMonths} mois d'avance)` : ""}.
                </>
              ) : (
                <>
                  Cette avance partielle règle le rattrapage et couvre jusqu&apos;à la{" "}
                  <b>ligne {previewLineInSheet} de {preview.coversThroughLabel}</b>
                  {preview.partialAfter > 0
                    ? `, dont ${formatFCFA(preview.partialAfter)} posés sur la ligne entamée`
                    : ""}
                  .
                </>
              )}{" "}
              Après cet encaissement, il restera{" "}
              <b className="amount">{formatFCFA(preview.resteAfter)}</b> à prendre sur le livret
              {preview.resteAfter === 0 ? " : il sera entièrement réglé." : "."}
            </p>
          )}
          {advanceExceeds && (
            <p className="mt-2 text-xs font-medium text-danger" role="alert">
              Montant supérieur au restant du livret ({formatFCFA(preview?.resteBefore ?? 0)}).
            </p>
          )}

          {/* Pavé numérique : montant d'avance libre */}
          <div className="mt-4">
            <AmountKeypad
              value={advanceAmount ?? ""}
              onChange={(v) => setAdvanceAmount(v)}
              disabled={false}
            />
          </div>
        </div>
      ) : (
        /* ── Mode ligne à ligne : due / rattrapage / avance ── */
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs font-medium uppercase tracking-wide text-subtle">
              Lignes du livret à régler
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
                Livret entièrement réglé : toutes les lignes encaissables sont couvertes.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3" role="group" aria-label="Lignes couvrables du livret">
              {/* Ligne due — aujourd'hui, ou rattrapage si en retard */}
              {view.due && (
                <div>
                  <p className={cn(
                    "mb-1 text-[11px] font-semibold uppercase tracking-wide",
                    view.late ? "text-danger" : "text-subtle"
                  )}>
                    {view.late
                      ? `Rattrapage · ${stop.livret.missedLines} ligne${stop.livret.missedLines > 1 ? "s" : ""} en retard`
                      : "Aujourd'hui"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <LineChip
                      payable={view.due}
                      dailyAmount={stop.dailyAmount}
                      state={view.late ? "late" : "due"}
                      selected={effectiveSelected.includes(view.due.line)}
                      onToggle={() => toggleLine(view.due!.line)}
                    />
                  </div>
                </div>
              )}

              {/* Lignes à venir : payer plusieurs lignes d'avance */}
              {view.rest.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Lignes suivantes · payer d&apos;avance
                  </p>
                  <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1.5">
                    {view.rest.map((p) => (
                      <LineChip
                        key={p.line}
                        payable={p}
                        dailyAmount={stop.dailyAmount}
                        state="advance"
                        selected={effectiveSelected.includes(p.line)}
                        onToggle={() => toggleLine(p.line)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Montant (mode ligne à ligne) : 40 px, chiffres tabulaires (§15.4) */}
      {mode === "lines" && (
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
                ? `${effectiveSelected.length} ligne${effectiveSelected.length > 1 ? "s" : ""} × ${formatFCFA(stop.dailyAmount)} · reste du livret : ${formatFCFA(Math.max(0, cycleTotal - stop.balance))}`
                : `Mise du jour : ${formatFCFA(stop.dailyAmount)} · reste du livret : ${formatFCFA(Math.max(0, cycleTotal - stop.balance))}`}
            </p>
          </div>
        </div>
      )}

      {/* Répartition du montant sur les lignes choisies */}
      {mode === "lines" && allocations.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-[#F4F7FB] px-3 py-2.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">Répartition</p>
          <ul className="space-y-1">
            {allocations.map((a) => {
              const p = view.payable.find((x) => x.line === a.line);
              const partialDay = a.amount < stop.dailyAmount;
              const isDue = view.due?.line === a.line;
              return (
                <li key={a.line} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ink">
                    {p?.company ? "Mise entreprise" : `Ligne ${p?.lineInSheet ?? a.line} (feuille ${p?.sheet ?? "—"})`}
                    {!isDue && <span className="ml-1 font-medium text-primary/80">d&apos;avance</span>}
                    {isDue && view.late && <span className="ml-1 font-medium text-danger/80">rattrapage</span>}
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
      {mode === "lines" && (
        <div className="mt-3 space-y-1.5">
          {unallocated && (
            <p className="text-xs font-medium text-danger" role="alert">
              Montant supérieur aux lignes sélectionnées. Sélectionne davantage de lignes à venir.
            </p>
          )}
          {overMax && (
            <p className="text-xs font-medium text-danger" role="alert">
              Montant supérieur au restant du livret ({formatFCFA(Math.max(0, cycleTotal - stop.balance))}).
            </p>
          )}
          {effectiveSelected.length === 0 && amount > 0 && (
            <p className="text-xs font-medium text-warning" role="alert">
              Choisis au moins une ligne pour attribuer l&apos;encaissement.
            </p>
          )}
        </div>
      )}

      {/* Clavier numérique (mode ligne à ligne) */}
      {mode === "lines" && (
        <div className="mt-4">
          <AmountKeypad
            value={amountInput ?? ""}
            onChange={(v) => setAmountInput(v)}
            disabled={false}
          />
        </div>
      )}

      {/* Bouton Encaisser pleine largeur */}
      <Button
        disabled={!canSubmit}
        onClick={submit}
        className={cn(
          "mt-5 flex h-14 w-full flex-col items-center justify-center gap-0.5 text-base font-semibold",
          mode === "advance"
            ? "bg-[#A66A00] text-white hover:bg-[#8f5a00]"
            : "bg-primary text-primary-foreground hover:bg-primary-hover"
        )}
      >
        <span className="amount inline-flex items-center gap-2">
          <Wallet className="h-5 w-5" aria-hidden />
          {mode === "advance" && preview && preview.valid && !preview.exceedsReste
            ? `Encaisser l'avance ${formatFCFA(preview.amount)}`
            : `Encaisser ${formatFCFA(amount)}`}
        </span>
        {mode === "advance" && preview && preview.valid && !preview.exceedsReste ? (
          <span className="text-[11px] font-medium text-white/80">
            {preview.coversFullSheet
              ? `couvre jusqu'à fin ${preview.coversThroughLabel}`
              : `couvre la ligne ${previewLineInSheet} de ${preview.coversThroughLabel}`}
          </span>
        ) : allocations.length > 1 ? (
          <span className="text-[11px] font-medium text-primary-foreground/80">
            {allocations.length} lignes · du n°{allocations[0].line} au n°{allocations[allocations.length - 1].line}
          </span>
        ) : null}
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
