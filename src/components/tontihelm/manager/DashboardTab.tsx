"use client";
// TontiHelm — tableau de bord du gérant (M6, écran 5) : jour/semaine/mois, graphique 7 jours,
// carnets en retard classés par jours manqués, écarts non résolus, activité récente.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "../KpiCard";
import { MethodBadge, PassbookStatusBadge, GapBadge, CashIcon, MobileMoneyIcon, MoneyIcon, AuditIcon } from "../StatusBadge";
import { DashboardData, formatFCFA } from "@/lib/types";
import { get } from "@/lib/client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Building2, Copy, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export function DashboardTab() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<DashboardData>("/api/manager/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Tableau de bord indisponible."));
  }, []);

  if (error) {
    return <Card className="border-[#F5C6C0]"><CardContent className="p-6 text-sm text-danger">{error}</CardContent></Card>;
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  const chartData = data.dailySeries.map((d) => ({ ...d, total: d.cash + d.mobile }));
  const lastUpgrade = data.alerts?.events.find((e) => e.kind === "plan_upgraded");

  return (
    <div className="space-y-6">
      {/* Montée en charge automatique : confirmation visible par les dirigeants */}
      {data.scaling?.upgraded && lastUpgrade && (
        <div className="flex items-start gap-3 rounded-xl border border-[#B5E8E5] bg-[#F6FDFB] p-4" role="status">
          <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-[#00806B]" aria-hidden />
          <div>
            <p className="text-sm font-bold text-[#00806B]">Palier supérieur activé automatiquement</p>
            <p className="mt-1 text-xs leading-relaxed text-ink">{lastUpgrade.message}</p>
          </div>
        </div>
      )}

      {/* Lien dédié de l'entité : propre à cette structure, pour ses agents et ses clients */}
      {data.entity && (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF4FD] text-primary">
            <Building2 className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">Le lien dédié de ton entité</p>
            <p className="mt-0.5 break-all font-mono text-xs text-subtle">{data.entity.url}</p>
            <p className="mt-1 text-xs leading-relaxed text-subtle">
              Donne-le à tes agents et gérants : leur connexion et les carnets de tes clients restent
              rattachés à <span className="font-medium text-ink">{data.entity.name}</span> — chaque entité a son propre lien.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 border-line"
            onClick={() => {
              void navigator.clipboard?.writeText(data.entity!.url);
              toast({ title: "Lien de ton entité copié." });
            }}
          >
            <Copy className="h-4 w-4" aria-hidden /> Copier
          </Button>
        </div>
      )}

      {/* Cartes de chiffres : 1 colonne mobile, 2 tablette, 4 bureau (§15.8) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Encaissements du jour" value={formatFCFA(data.today.total)} hint={`${data.today.count} versements`} icon={<CashIcon />} emphasis />
        <KpiCard label="Cette semaine" value={formatFCFA(data.week.total)} hint={`${data.week.count} versements`} />
        <KpiCard label="Ce mois" value={formatFCFA(data.month.total)} hint={`${data.month.count} versements`} />
        <KpiCard
          label="Cotisants actifs"
          value={String(data.contributors.activeThisMonth)}
          hint={`sur ${data.contributors.total} enregistrés`}
          icon={<Users className="h-4 w-4 tontihelm-icon" aria-hidden />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Graphique 7 jours : espèces + mobile money */}
        <Card className="border-line lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base font-bold">Encaissements des 7 derniers jours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#D9E2EC" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#64748B" }}
                    axisLine={false} tickLine={false} width={56}
                    tickFormatter={(v: number) => new Intl.NumberFormat("fr-FR").format(v)}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatFCFA(value), name === "cash" ? "Espèces" : "Mobile money"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #D9E2EC", fontSize: 13 }}
                  />
                  <Bar dataKey="cash" stackId="a" fill="#003887" radius={[0, 0, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="mobile" stackId="a" fill="#FFB800" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-subtle">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden /> Espèces</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-info" aria-hidden /> Mobile money</span>
            </div>
          </CardContent>
        </Card>

        {/* Répartition du jour */}
        <div className="space-y-4">
          <Card className="border-line">
            <CardHeader className="pb-2"><CardTitle className="font-display text-base font-bold">Par agent aujourd'hui</CardTitle></CardHeader>
            <CardContent className="space-y-2.5">
              {data.byAgent.length === 0 && <p className="text-sm text-subtle">Aucun encaissement aujourd'hui.</p>}
              {data.byAgent.map((a) => (
                <div key={a.name} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{a.name}</span>
                  <span className="amount font-semibold text-ink">{formatFCFA(a.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-line">
            <CardHeader className="pb-2"><CardTitle className="font-display text-base font-bold">Par quartier aujourd'hui</CardTitle></CardHeader>
            <CardContent className="space-y-2.5">
              {data.byArea.length === 0 && <p className="text-sm text-subtle">Aucun encaissement aujourd'hui.</p>}
              {data.byArea.map((a) => (
                <div key={a.name} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{a.name}</span>
                  <span className="amount font-semibold text-ink">{formatFCFA(a.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Carnets en retard, classés par jours manqués */}
        <Card className="border-line">
          <CardHeader className="pb-2">
            <CardTitle className="font-display flex items-center gap-2 text-base font-bold">
              <AlertTriangle className="h-4 w-4 tontihelm-icon text-danger" aria-hidden />
              Carnets en retard ({data.latePassbooks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.latePassbooks.length === 0 && (
              <p className="text-sm text-subtle">Aucun carnet en retard. Toute la tournée est à jour.</p>
            )}
            {data.latePassbooks.length > 0 && (
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-line">
                      <TableHead className="text-xs">Cotisant</TableHead>
                      <TableHead className="text-xs">Quartier</TableHead>
                      <TableHead className="text-xs text-right">Jours manqués</TableHead>
                      <TableHead className="text-xs text-right">Solde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.latePassbooks.map((p) => (
                      <TableRow key={p.passbookId} className="border-line">
                        <TableCell className="py-2.5">
                          <p className="text-sm font-medium text-ink">{p.contributor}</p>
                          <p className="text-xs text-subtle">Carnet {p.number} · {p.agent}</p>
                        </TableCell>
                        <TableCell className="text-sm text-subtle">{p.neighborhood}</TableCell>
                        <TableCell className="amount text-right">
                          <span className="inline-flex items-center justify-center rounded-md bg-[#FDECEA] px-2 py-0.5 text-sm font-bold text-danger">
                            {p.missedDays}
                          </span>
                        </TableCell>
                        <TableCell className="amount text-sm text-ink">{formatFCFA(p.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Écarts de caisse non résolus */}
        <Card className="border-line">
          <CardHeader className="pb-2">
            <CardTitle className="font-display flex items-center gap-2 text-base font-bold">
              <AuditIcon /> Écarts de caisse non résolus ({data.unresolvedClosings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.unresolvedClosings.length === 0 && (
              <p className="text-sm text-subtle">Aucun écart non résolu. Les caisses sont justes.</p>
            )}
            {data.unresolvedClosings.length > 0 && (
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-line">
                      <TableHead className="text-xs">Jour</TableHead>
                      <TableHead className="text-xs">Agent</TableHead>
                      <TableHead className="text-xs">Statut</TableHead>
                      <TableHead className="text-xs text-right">Écart</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.unresolvedClosings.map((c) => (
                      <TableRow key={c.id} className="border-line">
                        <TableCell className="text-sm text-ink">
                          {new Date(c.day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </TableCell>
                        <TableCell className="text-sm text-subtle">{c.agent}</TableCell>
                        <TableCell><GapBadge gap={c.gap} /></TableCell>
                        <TableCell className="amount text-sm font-bold text-danger">{formatFCFA(c.gap)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activité récente */}
      <Card className="border-line">
        <CardHeader className="pb-2">
          <CardTitle className="font-display flex items-center gap-2 text-base font-bold">
            <MoneyIcon /> Dernières écritures
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-line">
                  <TableHead className="text-xs">Heure</TableHead>
                  <TableHead className="text-xs">Cotisant</TableHead>
                  <TableHead className="text-xs">Carnet</TableHead>
                  <TableHead className="text-xs">Méthode</TableHead>
                  <TableHead className="text-xs">Agent</TableHead>
                  <TableHead className="text-xs text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((r) => (
                  <TableRow key={r.id} className="border-line">
                    <TableCell className="text-xs text-subtle">
                      {new Date(r.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-ink">{r.contributor}</TableCell>
                    <TableCell className="amount text-sm text-subtle">{r.passbook}</TableCell>
                    <TableCell><MethodBadge method={r.method} /></TableCell>
                    <TableCell className="text-sm text-subtle">{r.agent}</TableCell>
                    <TableCell className={`amount text-right text-sm font-semibold ${r.amount < 0 ? "text-danger" : "text-ink"}`}>
                      {formatFCFA(r.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
