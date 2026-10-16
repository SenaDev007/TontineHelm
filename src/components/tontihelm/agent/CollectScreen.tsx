"use client";
// TontiHelm — écran d'encaissement (maquette §15.9) : montant par défaut = mise du carnet,
// validé en une touche. Paiement partiel, double jour payé d'avance, jour manqué (§M3).
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PassbookStatusBadge, SyncStatusPill } from "../StatusBadge";
import { TourData, TourStop, formatFCFA } from "@/lib/types";
import { maxCollectionAmount } from "@/lib/domain";
import { Wallet, ChevronRight, Send } from "lucide-react";
import { cn } from "@/lib/utils";

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
          className="font-display flex h-[52px] items-center justify-center rounded-lg border border-line bg-surface text-lg font-semibold text-ink transition-colors hover:bg-[#EDF1EA] active:bg-[#E2E8DF] disabled:opacity-40"
        >
          {k === "eff" ? "eff" : k}
        </button>
      ))}
    </div>
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
  onCollect: (stop: TourStop, amount: number, advance: boolean) => void;
  onSelectStop: (stop: TourStop) => void;
  loading: boolean;
}) {
  const [amountInput, setAmountInput] = useState<string | null>(null);
  const [advance, setAdvance] = useState(false);

  const maxAmount = useMemo(() => {
    if (!stop) return 0;
    return maxCollectionAmount(
      { dailyAmount: stop.dailyAmount, cycleDays: stop.cycleDays, startsOn: new Date() },
      stop.balance,
      advance
    );
  }, [stop, advance]);

  const amount = amountInput === null ? (stop?.dailyAmount ?? 0) : parseInt(amountInput || "0", 10) || 0;
  const overMax = amount > maxAmount;
  const isPartial = amountInput !== null && amount < (stop?.dailyAmount ?? 0) && amount > 0;

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
  if (!stop) {
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
              onClick={() => { setAmountInput(null); setAdvance(false); onSelectStop(s); }}
              className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-[#F7FAF8]"
            >
              <span className="amount font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EDF1EA] text-sm font-bold text-ink" aria-hidden>
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

  // Écran d'encaissement (maquette §15.9)
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
          <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-[#F7F8F5] px-3 py-2.5">
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

      {/* Montant saisi par l'agent : 40 px, chiffres tabulaires (§15.4) */}
      <div className="mt-4">
        <Label className="text-xs font-medium uppercase tracking-wide text-subtle">Montant</Label>
        <div
          className={cn(
            "amount font-display mt-1 flex h-16 items-center justify-center rounded-lg border-2 text-[40px] font-bold leading-none",
            overMax ? "border-danger bg-[#FBEAE7] text-danger" : "border-primary bg-[#F2F7F4] text-primary"
          )}
          role="status"
          aria-live="polite"
        >
          {formatFCFA(amount)}
        </div>
        <div className="mt-2 flex min-h-[20px] items-center justify-between">
          <p className="text-xs text-subtle">
            Mise du jour : {formatFCFA(stop.dailyAmount)} · Reste du cycle : {formatFCFA(maxAmount)}
          </p>
          <button
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => { setAmountInput(null); setAdvance(false); }}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Cas réels : paiement partiel, double jour payé d'avance (§M3) */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3">
          <div>
            <Label htmlFor="advance" className="text-sm font-medium text-ink">Journée payée d'avance</Label>
            <p className="text-xs text-subtle">Le cotisant règle deux mises aujourd'hui.</p>
          </div>
          <Switch id="advance" checked={advance} onCheckedChange={(v) => { setAdvance(v); setAmountInput(null); }} />
        </div>
        {isPartial && (
          <p className="text-xs font-medium text-warning">
            Paiement partiel : le solde de ce jour restera dû.
          </p>
        )}
        {overMax && (
          <p className="text-xs font-medium text-danger" role="alert">
            Montant supérieur au restant du cycle. Active « journée d'avance » ou corrige.
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

      {/* Bouton Encaisser pleine largeur collé au bas du contenu */}
      <Button
        disabled={amount <= 0 || overMax}
        onClick={() => {
          onCollect(stop, amount, advance);
          setAmountInput(null);
          setAdvance(false);
        }}
        className="mt-5 flex h-14 w-full flex-col items-center justify-center gap-0.5 bg-primary text-base font-semibold text-primary-foreground hover:bg-[#0C5A3E]"
      >
        <span className="amount inline-flex items-center gap-2">
          <Wallet className="h-5 w-5" aria-hidden />
          Encaisser {formatFCFA(amount)}
        </span>
      </Button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-subtle">
        <Send className="h-3.5 w-3.5 tontihelm-icon" aria-hidden />
        {online
          ? "Reçu SMS envoyé au cotisant après synchronisation."
          : "Reçu SMS envoyé au retour du réseau."}
      </p>
      <div className="mt-2 flex justify-center">
        <SyncStatusPill state={online ? (pendingCount > 0 ? "pending" : "synced") : "offline"} pendingCount={pendingCount} />
      </div>
    </div>
  );
}
