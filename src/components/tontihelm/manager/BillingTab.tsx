"use client";
// TontiHelm — abonnement et factures (M9, écran 9) : palier, quotas, usage, factures.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubscriptionStatusBadge } from "../StatusBadge";
import { BillingData, SessionUser, SUB_STATUS, formatFCFA } from "@/lib/types";
import { get } from "@/lib/client";
import { CreditCard, Smartphone, Users, CheckCircle2, Clock, BellRing, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function BillingTab({ user }: { user: SessionUser }) {
  const [data, setData] = useState<BillingData | null>(null);

  useEffect(() => {
    get<BillingData>("/api/manager/billing")
      .then(setData)
      .catch(() => toast({ title: "Facturation indisponible", description: "Impossible de charger l'abonnement." }));
  }, []);

  if (!data) {
    return <div className="space-y-4"><Skeleton className="h-40 rounded-lg" /><Skeleton className="h-64 rounded-lg" /></div>;
  }

  const sub = data.subscription;
  const isOwner = user.role === "owner";
  const usage = data.usage;

  return (
    <div className="space-y-6">
      {/* Palier courant */}
      <Card className="border-line">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="font-display text-base font-bold">Abonnement</CardTitle>
            {sub && <SubscriptionStatusBadge status={sub.status} />}
          </div>
        </CardHeader>
        <CardContent>
          {sub ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-display text-2xl font-bold text-ink">{sub.planLabel}</p>
                  <p className="amount mt-1 text-sm text-subtle">
                    {formatFCFA(sub.price)} par mois · {SUB_STATUS[sub.status]}
                  </p>
                </div>
                {isOwner && (
                  <Button className="bg-primary text-primary-foreground hover:bg-primary-hover" onClick={() => toast({ title: "Paiement mobile money", description: "Le règlement par FedaPay s'activera en production." })}>
                    <Smartphone className="h-4 w-4" aria-hidden /> Payer par mobile money
                  </Button>
                )}
              </div>
              {sub.status === "trial" && sub.trialEndsAt && (
                <p className="mt-3 flex items-center gap-2 rounded-lg bg-[#E8F1FD] px-3 py-2 text-sm text-[#0B6BCB]">
                  <Clock className="h-4 w-4" aria-hidden />
                  Active ton abonnement avant le {new Date(sub.trialEndsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} pour garder les encaissements actifs.
                </p>
              )}
              {sub.status === "past_due" && (
                <p className="mt-3 rounded-lg bg-[#FFF4D6] px-3 py-2 text-sm text-[#A66A00]">
                  Ton abonnement est impayé. Dans 15 jours, ton compte passe en lecture seule. Tes données
                  restent intactes.
                </p>
              )}
              {sub.status === "read_only" && (
                <p className="mt-3 rounded-lg bg-[#FDECEA] px-3 py-2 text-sm text-[#B3261E]">
                  Compte en lecture seule. Règle ton abonnement pour reprendre les encaissements.
                </p>
              )}
              {sub.periodEnd && (
                <p className="mt-3 text-xs text-subtle">
                  Période en cours jusqu'au {new Date(sub.periodEnd).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-subtle">Aucun abonnement enregistré.</p>
          )}
        </CardContent>
      </Card>

      {/* Usage et quotas */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-line">
          <CardHeader className="pb-3">
            <CardTitle className="font-display flex items-center gap-2 text-base font-bold">
              <Users className="h-4 w-4 tontihelm-icon text-primary" aria-hidden /> Cotisants actifs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <p className="amount font-display text-2xl font-bold text-ink">{usage.contributors}</p>
              <p className="text-sm text-subtle">sur {usage.contributorsQuota} inclus</p>
            </div>
            <Progress value={Math.min(100, (usage.contributors / usage.contributorsQuota) * 100)} className="h-2" aria-label={`Quota cotisants : ${usage.contributors} sur ${usage.contributorsQuota}`} />
            {usage.contributors >= usage.contributorsQuota ? (
              <p className="text-xs font-medium text-warning">Palier atteint : passe au palier supérieur pour enregistrer d&apos;autres cotisants.</p>
            ) : usage.contributorsQuota - usage.contributors <= 5 ? (
              <p className="text-xs text-subtle">Il te reste {usage.contributorsQuota - usage.contributors} place{(usage.contributorsQuota - usage.contributors) > 1 ? "s" : ""} de cotisants sur ce palier.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card className="border-line">
          <CardHeader className="pb-3">
            <CardTitle className="font-display flex items-center gap-2 text-base font-bold">
              <CreditCard className="h-4 w-4 tontihelm-icon text-primary" aria-hidden /> Agents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <p className="amount font-display text-2xl font-bold text-ink">{usage.agents}</p>
              <p className="text-sm text-subtle">sur {usage.agentsQuota} inclus</p>
            </div>
            <Progress value={Math.min(100, (usage.agents / usage.agentsQuota) * 100)} className="h-2" aria-label={`Quota agents : ${usage.agents} sur ${usage.agentsQuota}`} />
            {usage.agents >= usage.agentsQuota ? (
              <p className="text-xs font-medium text-warning">Palier atteint : passe au palier supérieur pour ajouter d&apos;autres agents.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-line">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium text-ink">Liens de carnet et relances</p>
            <p className="text-xs text-subtle">
              Chaque cotisant suit sa tontine depuis son lien personnel (WhatsApp / e-mail) — sans coût par message.
            </p>
          </div>
          <div className="flex items-center gap-4">
            {usage.remindersIncluded ? (
              <Badge variant="outline" className="gap-1.5 rounded-md border-[#B5E8E5] bg-[#DFF6F4] px-2 py-1 text-xs font-medium text-[#00806B]">
                <BellRing className="h-3.5 w-3.5" aria-hidden /> Relances incluses
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 rounded-md border-[#F0D48A] bg-[#FFF4D6] px-2 py-1 text-xs font-medium text-[#A66A00]">
                <BellRing className="h-3.5 w-3.5" aria-hidden /> Relances dès le palier Pro
              </Badge>
            )}
            <Link2 className="h-5 w-5 text-primary" aria-hidden />
          </div>
        </CardContent>
      </Card>

      {/* Factures */}
      <Card className="border-line">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base font-bold">Factures</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-line">
                <TableHead>Période</TableHead>
                <TableHead>Détail</TableHead>
                <TableHead className="text-right">Total TTC</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invoices.map((inv) => (
                <TableRow key={inv.id} className="border-line">
                  <TableCell className="text-sm font-medium text-ink">
                    {inv.period.replace("-", " · ")}
                  </TableCell>
                  <TableCell className="text-xs text-subtle">
                    Palier {formatFCFA(inv.baseAmount)}
                    {typeof inv.extras?.vatRate === "number" && ` + TVA ${Math.round(inv.extras.vatRate * 100)} %`}
                  </TableCell>
                  <TableCell className="amount text-sm font-semibold text-ink">{formatFCFA(inv.total)}</TableCell>
                  <TableCell>
                    {inv.status === "paid" ? (
                      <Badge variant="outline" className="gap-1.5 rounded-md border-[#B5E8E5] bg-[#DFF6F4] px-2 py-0.5 text-xs font-medium text-[#00806B]">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        Payée {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1.5 rounded-md border-[#F0D48A] bg-[#FFF4D6] px-2 py-0.5 text-xs font-medium text-[#A66A00]">
                        <Clock className="h-3.5 w-3.5" aria-hidden /> À régler
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
