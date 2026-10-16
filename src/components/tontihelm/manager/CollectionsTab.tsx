"use client";
// TontiHelm — journal des encaissements (écran 5/6) avec annulation par écriture inverse (M8).
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MethodBadge } from "../StatusBadge";
import { CollectionsPage, formatFCFA } from "@/lib/types";
import { get, post } from "@/lib/client";
import { Search, ChevronLeft, ChevronRight, Undo2, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

export function CollectionsTab({ readOnly }: { readOnly: boolean }) {
  const [data, setData] = useState<CollectionsPage | null>(null);
  const [page, setPage] = useState(1);
  const [method, setMethod] = useState("all");
  const [search, setSearch] = useState("");
  const [reversalTarget, setReversalTarget] = useState<{ id: string; contributor: string; amount: number } | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (p: number, m: string) => {
    try {
      const d = await get<CollectionsPage>(`/api/manager/collections?page=${p}&method=${m === "all" ? "" : m}`);
      setData(d);
    } catch {
      toast({ title: "Journal indisponible", description: "Impossible de charger les encaissements." });
    }
  }, []);

  useEffect(() => {
    load(page, method);
  }, [load, page, method]);

  const filtered = (data?.collections ?? []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.contributor.toLowerCase().includes(q) || c.passbook.includes(q);
  });

  async function reverse() {
    if (!reversalTarget) return;
    setSubmitting(true);
    try {
      const res = await post<{ message: string }>("/api/manager/collections", {
        action: "reverse",
        collectionId: reversalTarget.id,
        reason,
      });
      toast({ title: res.message });
      setReversalTarget(null);
      setReason("");
      load(page, method);
    } catch (err) {
      toast({ title: "Annulation impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setSubmitting(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      {/* Filtres */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un cotisant ou un carnet" className="h-11 border-line pl-9" aria-label="Rechercher" />
        </div>
        <div className="flex gap-2">
          <Select value={method} onValueChange={(v) => { setMethod(v); setPage(1); }}>
            <SelectTrigger className="h-11 w-full border-line sm:w-44" aria-label="Filtrer par méthode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les méthodes</SelectItem>
              <SelectItem value="cash">Espèces</SelectItem>
              <SelectItem value="mobile_money">Mobile money</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-11 border-line"
            onClick={() => toast({ title: "Export préparé", description: "Excel et PDF arrivent avec le module d'export complet." })}
          >
            <Download className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Exporter</span>
          </Button>
        </div>
      </div>

      {!data ? (
        <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : (
        <>
          <Card className="border-line">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-line">
                    <TableHead>Heure</TableHead>
                    <TableHead>Cotisant</TableHead>
                    <TableHead>Carnet</TableHead>
                    <TableHead>Journée couverte</TableHead>
                    <TableHead>Méthode</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    {!readOnly && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id} className="border-line">
                      <TableCell className="whitespace-nowrap text-xs text-subtle">
                        {new Date(c.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-ink">
                        {c.contributor}
                        {c.reversesId && <span className="ml-2 text-xs font-medium text-danger">annulation</span>}
                      </TableCell>
                      <TableCell className="amount text-sm text-subtle">{c.passbook}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {c.coversOn ? (
                          <span className="font-medium text-ink">
                            {new Date(c.coversOn).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                          </span>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </TableCell>
                      <TableCell><MethodBadge method={c.method} /></TableCell>
                      <TableCell className="text-sm text-subtle">{c.agent}</TableCell>
                      <TableCell className={`amount text-right text-sm font-semibold ${c.amount < 0 ? "text-danger" : "text-ink"}`}>
                        {formatFCFA(c.amount)}
                      </TableCell>
                      {!readOnly && (
                        <TableCell>
                          {c.amount > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-subtle hover:bg-[#FDECEA] hover:text-danger"
                              onClick={() => setReversalTarget({ id: c.id, contributor: c.contributor, amount: c.amount })}
                              aria-label={`Annuler l'encaissement de ${c.contributor}`}
                            >
                              <Undo2 className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-subtle">
              {data.total} écritures · page {data.page}/{totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-line" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden /> Précédent
              </Button>
              <Button variant="outline" size="sm" className="border-line" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Suivant <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Dialogue d'annulation : une correction crée une nouvelle ligne (§M8) */}
      <Dialog open={reversalTarget !== null} onOpenChange={(o) => !o && setReversalTarget(null)}>
        <DialogContent className="sm:max-w-md" aria-describedby="reverse-desc">
          <DialogHeader>
            <DialogTitle className="font-display">Annuler cet encaissement ?</DialogTitle>
            <DialogDescription id="reverse-desc">
              {reversalTarget
                ? `${formatFCFA(reversalTarget.amount)} chez ${reversalTarget.contributor}. Une écriture d'annulation sera créée : la ligne d'origine reste visible dans le journal.`
                : "Une écriture d'annulation sera créée : la ligne d'origine reste visible dans le journal."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="reason" className="text-sm font-medium text-ink">Motif de l'annulation</label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Double saisie, erreur de montant…" className="border-line" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversalTarget(null)} className="border-line">Fermer</Button>
            <Button onClick={reverse} disabled={submitting || reason.trim().length < 3} className="bg-danger text-white hover:bg-[#B3261E]">
              {submitting ? "Annulation…" : "Créer l'annulation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
