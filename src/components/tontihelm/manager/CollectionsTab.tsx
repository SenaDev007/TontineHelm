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
import { get, isOfflineQueued, post } from "@/lib/client";
import { useSyncDone } from "@/lib/offline/hooks";
import { downloadCsv, printReport } from "@/lib/export";
import { ExportMenu } from "./ExportMenu";
import { Search, ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

export function CollectionsTab({ readOnly, structureName }: { readOnly: boolean; structureName: string }) {
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

  useSyncDone(() => load(page, method));

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
      if (isOfflineQueued(res)) {
        toast({ title: "Annulation enregistrée hors ligne.", description: "Elle partira au serveur dès le retour du réseau." });
      } else {
        toast({ title: res.message });
        load(page, method);
      }
      setReversalTarget(null);
      setReason("");
    } catch (err) {
      toast({ title: "Annulation impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setSubmitting(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  /* ── Export réel : la totalité du journal (toutes les pages), méthode filtrée ── */
  const [exporting, setExporting] = useState(false);

  async function fetchAll(): Promise<CollectionsPage["collections"]> {
    const all = [] as CollectionsPage["collections"];
    let p = 1;
    // Garde-fou : 100 pages maximum (~5 000 écritures).
    for (let guard = 0; guard < 100; guard++, p++) {
      const d = await get<CollectionsPage>(
        `/api/manager/collections?page=${p}&method=${method === "all" ? "" : method}`
      );
      all.push(...d.collections);
      if (p * d.pageSize >= d.total || d.collections.length === 0) break;
    }
    return all;
  }

  function exportRows(rows: CollectionsPage["collections"]) {
    return rows.map((c) => [
      new Date(c.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      c.contributor,
      c.passbook,
      c.coversOn ? new Date(c.coversOn).toLocaleDateString("fr-FR") : "",
      c.method === "cash" ? "Espèces" : "Mobile money",
      c.agent,
      c.amount,
      c.reversesId ? "Annulation" : "",
    ]);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const rows = exportRows(await fetchAll());
      const header = ["Date et heure", "Cotisant", "Carnet", "Journée couverte", "Méthode", "Agent", "Montant (FCFA)", "Type"];
      downloadCsv(`encaissements-${new Date().toISOString().slice(0, 10)}`, [header, ...rows]);
      // Confirmation différée : le démarrage d'un téléchargement détourne le
      // focus de la page et peut fermer une notification qui vient de naître.
      setTimeout(() => {
        toast({ title: "Export Excel prêt.", description: `${rows.length} écritures téléchargées en CSV.` });
      }, 600);
    } catch {
      toast({ title: "Export impossible", description: "Vérifie ta connexion puis réessaie." });
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const all = await fetchAll();
      printReport(
        {
          structure: structureName,
          title: "Journal des encaissements",
          subtitle: `${method === "all" ? "Toutes les méthodes" : method === "cash" ? "Espèces" : "Mobile money"} · ${all.length} écritures · total ${formatFCFA(all.reduce((s, c) => s + c.amount, 0))}`,
        },
        [
          { header: "Date" },
          { header: "Cotisant" },
          { header: "Carnet" },
          { header: "Journée" },
          { header: "Méthode" },
          { header: "Agent" },
          { header: "Montant (FCFA)", align: "right" },
        ],
        exportRows(all)
      );
    } catch {
      toast({ title: "Export impossible", description: "Vérifie ta connexion puis réessaie." });
    } finally {
      setExporting(false);
    }
  }

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
          <ExportMenu onCsv={exportCsv} onPdf={exportPdf} busy={exporting} label="Exporter" />
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
