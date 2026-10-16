"use client";
// TontiHelm — journal d'audit (M8, écran 8) : chaîne de hash vérifiée, export par le contrôleur.
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuditPage, formatFCFA } from "@/lib/types";
import { get } from "@/lib/client";
import { Link2, ShieldCheck, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const ACTION_LABELS: Record<string, string> = {
  login: "Connexion",
  collection: "Encaissement",
  reverse: "Annulation",
  closing_declared: "Clôture déclarée",
  closing_validated: "Clôture validée",
  structure_approved: "Structure validée",
  structure_suspended: "Structure suspendue",
  payment_link_created: "Lien de paiement",
  payment_approved: "Paiement approuvé",
  invoice_paid: "Facture réglée",
  contributor_created: "Cotisant créé",
  passbook_created: "Carnet créé",
};

export function AuditTab() {
  const [data, setData] = useState<AuditPage | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("all");

  useEffect(() => {
    let cancelled = false;
    get<AuditPage>(`/api/manager/audit?page=${page}${action !== "all" ? `&action=${action}` : ""}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        toast({ title: "Journal indisponible", description: "Impossible de charger le journal d'audit." });
      });
    return () => {
      cancelled = true;
    };
  }, [page, action]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  if (!data) {
    return <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Intégrité de la chaîne */}
      <Card className={data.chainOk ? "border-[#B5E8E5] bg-[#E9FAF9]" : "border-[#F5C6C0] bg-[#FDECEA]"}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            {data.chainOk ? (
              <ShieldCheck className="h-6 w-6 tontihelm-icon text-success" aria-hidden />
            ) : (
              <Link2 className="h-6 w-6 tontihelm-icon text-danger" aria-hidden />
            )}
            <div>
              <p className={`text-sm font-semibold ${data.chainOk ? "text-success" : "text-danger"}`}>
                {data.chainOk ? "Chaîne d'audit intacte" : "Rupture détectée dans la chaîne d'audit"}
              </p>
              <p className="text-xs text-subtle">
                {data.total} lignes horodatées. Chaque ligne scelle la précédente par son hash.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-line"
            onClick={() => toast({ title: "Export préparé", description: "L'export complet du journal arrive avec le module d'export." })}
          >
            <Download className="h-4 w-4" aria-hidden /> Exporter le journal
          </Button>
        </CardContent>
      </Card>

      {/* Filtres */}
      <div className="flex items-center justify-between gap-3">
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
          <SelectTrigger className="h-11 w-full border-line sm:w-56" aria-label="Filtrer par type d'action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les actions</SelectItem>
            {data.actions.map((a) => (
              <SelectItem key={a.action} value={a.action}>
                {ACTION_LABELS[a.action] ?? a.action} ({a.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="hidden text-sm text-subtle sm:block">Page {data.page}/{totalPages}</p>
      </div>

      <Card className="border-line">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-line">
                <TableHead>Horodatage</TableHead>
                <TableHead>Auteur</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Détail</TableHead>
                <TableHead>Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.logs.map((l) => (
                <TableRow key={l.seq} className="border-line align-top">
                  <TableCell className="whitespace-nowrap text-xs text-subtle">
                    {new Date(l.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="text-sm">
                    <p className="font-medium text-ink">{l.actor}</p>
                    <p className="text-xs text-subtle">
                      {l.actorRole === "manager" ? "gérante" : l.actorRole === "agent" ? "agent" : l.actorRole === "owner" ? "propriétaire" : l.actorRole === "admin" ? "admin" : "système"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-ink">{ACTION_LABELS[l.action] ?? l.action}</TableCell>
                  <TableCell className="max-w-72 text-xs text-subtle">
                    {Object.entries(l.payload).slice(0, 4).map(([k, v]) => {
                      const label = renderPayloadKey(k, v);
                      return label ? <span key={k} className="mr-2 inline-block">{label}</span> : null;
                    })}
                  </TableCell>
                  <TableCell className="amount font-mono text-xs text-subtle">{l.hash}…</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-subtle sm:hidden">Page {data.page}/{totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-line" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Précédent
          </Button>
          <Button variant="outline" size="sm" className="border-line" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Suivant <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

function renderPayloadKey(key: string, value: unknown): string | null {
  switch (key) {
    case "contributor": return value ? `${value}` : null;
    case "amount": return typeof value === "number" ? formatFCFA(value) : null;
    case "passbook": return value ? `carnet ${value}` : null;
    case "day": return value ? `${value}` : null;
    case "gap": return typeof value === "number" ? `écart ${formatFCFA(value)}` : null;
    case "reason": return value ? `motif : ${value}` : null;
    case "decision": return value ? `décision : ${value}` : null;
    case "advance": return value === true ? "paiement d'avance" : null;
    case "phone": return value ? `${value}` : null;
    case "role": return null;
    default: return null;
  }
}
