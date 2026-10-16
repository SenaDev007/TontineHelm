"use client";
// TontiHelm — déclaration de clôture de caisse (M5, écran 4).
// L'agent déclare le total en espèces remis ; le système compare aux encaissements et affiche l'écart.
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ClosingStatusBadge, GapBadge } from "../StatusBadge";
import { OutboxEvent, TourData, formatFCFA } from "@/lib/types";
import { isOfflineQueued, post } from "@/lib/client";
import { Lock, Scale, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function ClosingScreen({
  tour,
  online,
  outbox,
  onDeclared,
}: {
  tour: TourData | null;
  online: boolean;
  outbox: OutboxEvent[];
  onDeclared: () => void;
}) {
  const [declared, setDeclared] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ gap: number; message: string } | null>(null);

  if (!tour) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-11 w-40" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  const expectedCash = tour.summary.expectedCash + outbox.reduce((s, e) => s + e.amount, 0);
  const mobileToday = tour.summary.mobileToday;
  const closing = tour.closing;
  const declaredValue = parseInt(declared || "0", 10) || 0;
  const gapNow = declaredValue - expectedCash;

  async function declare() {
    setSubmitting(true);
    try {
      const res = await post<{ message: string; closing: { gap: number } }>("/api/agent/closing", {
        declaredCash: declaredValue,
      });
      if (isOfflineQueued(res)) {
        setResult({
          gap: gapNow,
          message:
            "Déclaration enregistrée sur ton téléphone. Elle part au serveur dès le retour du réseau.",
        });
        setDeclared("");
        toast({ title: "Clôture enregistrée hors ligne." });
      } else {
        setResult({ gap: res.closing.gap, message: res.message });
        setDeclared("");
        toast({ title: res.message });
        onDeclared();
      }
    } catch (err) {
      toast({
        title: "Déclaration impossible",
        description: err instanceof Error ? err.message : "Réessaie.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink">Clôture de caisse</h2>
      <p className="text-sm text-subtle">
        En fin de tournée, déclare le total en espèces que tu remets à la structure.
      </p>

      {/* Résumé ClosingSummary (§15.7) */}
      <Card className="border-line">
        <CardHeader className="pb-3">
          <CardTitle className="font-display flex items-center justify-between text-base font-bold">
            Aujourd'hui
            {closing && <ClosingStatusBadge status={closing.status} />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-subtle">Espèces attendues</span>
            <span className="amount font-semibold text-ink">{formatFCFA(expectedCash)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-subtle">Mobile money (hors caisse)</span>
            <span className="amount font-semibold text-ink">{formatFCFA(mobileToday)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-subtle">Encaissements du jour</span>
            <span className="amount font-semibold text-ink">
              {formatFCFA(expectedCash + mobileToday)}
            </span>
          </div>
        </CardContent>
      </Card>

      {closing && closing.status !== "open" ? (
        <Card className={closing.gap === 0 ? "border-[#B5E8E5]" : closing.gap < 0 ? "border-[#F5C6C0]" : "border-[#C5D8ED]"}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Déclaration transmise</p>
              <GapBadge gap={closing.gap} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-subtle">Espèces déclarées</span>
              <span className="amount font-semibold text-ink">{formatFCFA(closing.declaredCash)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-subtle">Écart constaté</span>
              <span className="amount font-semibold text-danger">{formatFCFA(closing.gap)}</span>
            </div>
            <p className="flex items-start gap-2 rounded-lg bg-[#F4F7FB] p-3 text-xs leading-relaxed text-subtle">
              {closing.status === "validated" ? (
                <>
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  Clôture validée. Les encaissements du jour sont verrouillés.
                </>
              ) : (
                <>
                  <Scale className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  Le gérant doit valider ou contester cette clôture. Vérifie ta caisse en attendant.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-line">
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="declared">Espèces remises (FCFA)</Label>
              <Input
                id="declared"
                inputMode="numeric"
                value={declared}
                onChange={(e) => setDeclared(e.target.value.replace(/\D/g, ""))}
                placeholder={String(expectedCash)}
                className="amount h-14 border-line text-center text-2xl font-bold"
                aria-describedby="gap-hint"
              />
            </div>
            {declared !== "" && (
              <div id="gap-hint" className="flex items-center justify-between rounded-lg bg-[#F4F7FB] px-3 py-2.5" role="status" aria-live="polite">
                <span className="text-sm text-subtle">Écart calculé</span>
                <span className={`amount text-base font-bold ${gapNow === 0 ? "text-success" : "text-danger"}`}>
                  {gapNow === 0 ? "Aucun écart" : formatFCFA(gapNow)}
                </span>
              </div>
            )}
            {gapNow !== 0 && declared !== "" && (
              <p className="text-xs font-medium text-danger" role="alert">
                Écart de {formatFCFA(Math.abs(gapNow))} entre ta déclaration et tes encaissements. Vérifie
                la tournée avant de valider.
              </p>
            )}
            <Button
              onClick={declare}
              disabled={declared === "" || submitting || !online}
              className="h-13 w-full bg-primary py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Lock className="h-4 w-4" aria-hidden />
              {submitting ? "Déclaration…" : "Déclarer ma caisse du jour"}
            </Button>
            {!online && (
              <p className="text-center text-xs text-subtle">
                La déclaration nécessite le réseau. Elle partira à la synchronisation.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {result && <p className="text-sm text-subtle">{result.message}</p>}
    </div>
  );
}
