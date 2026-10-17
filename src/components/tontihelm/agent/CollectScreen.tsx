"use client";
// TontiHelm — écran d'encaissement du livret annuel (2026-10) :
// les écritures remplissent les lignes du livret SÉQUENTIELLEMENT, comme le
// marquage du carnet papier. La ligne due (la prochaine non couverte) se
// collecte « aujourd'hui » — en retard s'il y a des lignes manquées (rattrapage) ;
// sélectionner des lignes suivantes = payer d'AVANCE (le système calcule le
// reste dynamiquement). La 31e ligne d'une feuille est la mise de l'ENTREPRISE :
// marquée, jamais inscrite.
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PassbookStatusBadge, SyncStatusPill } from "../StatusBadge";
import { PayableLine, TourData, TourStop, formatFCFA } from "@/lib/types";
import { Building2, Wallet, ChevronRight, Link2, Check, RotateCcw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Allocation d'un encaissement : une écriture par ligne du livret. */
export interface CollectAllocation {
  line: number; // ligne absolue du livret (1..372)
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
    if (!view || !stop) return [];
    let left = amount;
    const out: CollectAllocation[] = [];
    for (const line of effectiveSelected) {
      const take = Math.min(stop.dailyAmount, left);
      if (take > 0) out.push({ line, amount: take });
      left -= take;
    }
    return out;
  }, [amount, effectiveSelected, view, stop]);

  const cycleTotal = stop?.livret?.recap.attendu ?? 0;
  const overMax = stop !== null && amount > cycleTotal - stop.balance;
  const unallocated = amount > suggestedTotal; // trop de montant pour les lignes choisies
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
                  {s.neighborhood} · F{s.livret.currentSheet}/12 · L{s.livret.dueLineInSheet} · {formatFCFA(s.dailyAmount)}
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
  };

  const sheet = stop.livret.sheet;

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
                Feuille {sheet.index}/12 ({sheet.label}) · ligne {stop.livret.dueLineInSheet} · {stop.neighborhood}
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
              Lignes couvertes : {stop.livret.coveredLines}/372
              {stop.livret.missedLines > 0 && (
                <span className="font-semibold text-danger"> · {stop.livret.missedLines} en retard</span>
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

      {/* ── Sélecteur de lignes : due / rattrapage / avance ── */}
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
              Livret entièrement réglé : les 372 lignes sont couvertes.
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
              ? `${effectiveSelected.length} ligne${effectiveSelected.length > 1 ? "s" : ""} × ${formatFCFA(stop.dailyAmount)} · reste du livret : ${formatFCFA(Math.max(0, cycleTotal - stop.balance))}`
              : `Mise du jour : ${formatFCFA(stop.dailyAmount)} · reste du livret : ${formatFCFA(Math.max(0, cycleTotal - stop.balance))}`}
          </p>
        </div>
      </div>

      {/* Répartition du montant sur les lignes choisies */}
      {allocations.length > 0 && (
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
            {allocations.length} lignes · du n°{allocations[0].line} au n°{allocations[allocations.length - 1].line}
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
