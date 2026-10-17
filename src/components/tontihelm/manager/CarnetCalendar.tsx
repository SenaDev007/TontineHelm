"use client";
// TontiHelm — livret annuel détaillé d'un carnet (vue gérant/dirigeant, 2026-10).
// Remplace l'ancienne vue calendrier : le carnet est un LIVRET ANNUEL — 12
// feuilles mensuelles de 31 lignes (la 31e = mise de l'entreprise, champs
// avance/reste) + la 13e feuille de récapitulatif. Inclut la préparation de la
// remise de fin de souscription (le client signe ensuite sur SON lien de carnet)
// et le journal des écritures.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PassbookStatusBadge } from "../StatusBadge";
import { LivretSheets } from "../carnet/LivretSheets";
import { CarnetData, formatFCFA } from "@/lib/types";
import { get, post } from "@/lib/client";
import {
  BadgeCheck, Building2, FileSignature, Landmark, Link2, Phone, User,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function CarnetCalendar({ passbookId }: { passbookId: string }) {
  const [data, setData] = useState<CarnetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(() => {
    get<CarnetData>(`/api/manager/passbooks/${passbookId}/carnet`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Carnet indisponible."));
  }, [passbookId]);

  useEffect(() => {
    load();
  }, [load]);

  async function prepareRemise() {
    setCompleting(true);
    try {
      const res = await post<{
        message: string;
        payoutAmount: number;
        companyAmount: number;
        signUrl: string;
      }>(`/api/manager/passbooks/${passbookId}/complete`, {});
      toast({
        title: "Remise préparée.",
        description: res.message,
      });
      load();
    } catch (err) {
      toast({ title: "Préparation impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setCompleting(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-white p-6 text-center">
        <p className="text-sm font-medium text-danger">{error}</p>
        <Button variant="outline" className="mt-3 border-line" onClick={load}>Réessayer</Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const pb = data.passbook;
  const completion = data.completion;

  return (
    <div className="space-y-4">
      {/* En-tête du livret */}
      <Card className="border-line">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="amount font-display text-base font-bold text-ink">
                Carnet {pb.number}{pb.label ? <span className="font-normal text-subtle"> · {pb.label}</span> : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                <span className="inline-flex items-center gap-1"><User className="h-3 w-3" aria-hidden /> {pb.contributor.fullName}</span>
                {pb.contributor.phone && (
                  <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" aria-hidden /> {pb.contributor.phone}</span>
                )}
                <span>Agent : {pb.agent}</span>
              </p>
              <p className="mt-1 text-xs text-subtle">
                Livret annuel · 12 feuilles mensuelles · mise {formatFCFA(pb.dailyAmount)} · démarré le{" "}
                {new Date(pb.startsOn).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <PassbookStatusBadge status={pb.status} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Solde cumulé</p>
              <p className="amount text-sm font-bold text-ink">{formatFCFA(pb.balance)}</p>
            </div>
            <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Lignes couvertes</p>
              <p className="amount text-sm font-bold text-ink">{pb.coveredLines}/372</p>
            </div>
            <div className="rounded-lg bg-[#F4F7FB] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Feuille en cours</p>
              <p className="amount text-sm font-bold text-ink">{pb.currentSheet}/12</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 12 feuilles mensuelles + 13e feuille de récapitulatif */}
      <Card className="border-line">
        <CardContent className="p-4">
          <LivretSheets livret={data.livret} />
        </CardContent>
      </Card>

      {/* Fin de souscription : remise + signature numérique du client */}
      {(pb.status === "active" || pb.status === "late") && (
        <Card className="border-line">
          <CardContent className="p-4">
            <p className="font-display text-sm font-bold text-ink">Fin de souscription</p>
            <p className="mt-1 text-xs leading-relaxed text-subtle">
              Quand {pb.contributor.fullName} a fini de cotiser et vient prendre son argent : prépare la remise.
              Le système calcule le récapitulatif (part entreprise = 31es mises) et le client signe
              <b> sur son lien de carnet</b> pour certifier — le carnet est ensuite archivé automatiquement.
            </p>
            <Button
              className="mt-3 h-11 w-full bg-primary text-primary-foreground hover:bg-primary-hover"
              onClick={prepareRemise}
              disabled={completing}
            >
              <FileSignature className="h-4 w-4" aria-hidden />
              {completing ? "Préparation…" : "Préparer la remise (fin de souscription)"}
            </Button>
          </CardContent>
        </Card>
      )}

      {pb.status === "closing" && (
        <Card className="border-[#F0D48A] bg-[#FFFCF2]">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 font-display text-sm font-bold text-[#A66A00]">
              <FileSignature className="h-4 w-4" aria-hidden /> Remise préparée — en attente de signature
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                  <Landmark className="h-3 w-3" aria-hidden /> À remettre au client
                </p>
                <p className="amount text-sm font-bold text-[#00806B]">{formatFCFA(completion.payoutAmount ?? 0)}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                  <Building2 className="h-3 w-3" aria-hidden /> Part entreprise
                </p>
                <p className="amount text-sm font-bold text-primary">{formatFCFA(completion.companyAmount ?? 0)}</p>
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-subtle">
              Envoie au client son lien de carnet (WhatsApp) : il y signe pour certifier qu&apos;il a pris son
              argent. Dès sa signature, le carnet est archivé (onglet Archive).
            </p>
            <Button
              variant="outline"
              className="mt-3 h-10 w-full border-line"
              onClick={() => {
                void navigator.clipboard?.writeText(
                  `${window.location.origin}/carnet/…`
                );
                toast({ title: "Lien du carnet", description: "Utilise le lien de partage du cotisant (onglet Cotisants ou Carnets de son agent)." });
              }}
            >
              <Link2 className="h-4 w-4" aria-hidden /> Voir avec le client son lien de signature
            </Button>
          </CardContent>
        </Card>
      )}

      {pb.status === "completed" && (
        <Card className="border-[#9ED9D3] bg-[#F6FDFB]">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 font-display text-sm font-bold text-[#00806B]">
              <BadgeCheck className="h-4 w-4" aria-hidden /> Souscription terminée, signée et archivée
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-subtle">
              Remis au client : <span className="amount font-semibold text-ink">{formatFCFA(completion.payoutAmount ?? 0)}</span> ·
              part entreprise : <span className="amount font-semibold text-ink">{formatFCFA(completion.companyAmount ?? 0)}</span>
              {completion.signatureName ? (
                <> · signé par <span className="font-semibold text-ink">{completion.signatureName}</span></>
              ) : null}
              {completion.signedAt
                ? ` le ${new Date(completion.signedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
                : ""}
              .
            </p>
          </CardContent>
        </Card>
      )}

      {/* Journal des écritures */}
      <Card className="border-line">
        <CardContent className="p-4">
          <p className="font-display text-sm font-bold text-ink">Écritures ({data.collections.length})</p>
          {data.collections.length === 0 ? (
            <p className="mt-2 text-xs text-subtle">Aucun encaissement pour le moment.</p>
          ) : (
            <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {[...data.collections].reverse().slice(0, 30).map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg bg-[#F4F7FB] px-3 py-2 text-xs">
                  <span className="text-subtle">
                    {new Date(c.collectedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}{" "}
                    {new Date(c.collectedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    <span className="amount ml-2 font-medium text-ink">L{c.dayIndex}</span>
                    <span className="ml-2">{c.method === "cash" ? "espèces" : "mobile money"}</span>
                    {c.amount < 0 && <span className="ml-1 font-semibold text-danger">(annulation)</span>}
                  </span>
                  <span className={cnAmount(c.amount)}>{formatFCFA(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function cnAmount(amount: number): string {
  return amount < 0 ? "amount font-semibold text-danger" : "amount font-semibold text-ink";
}
