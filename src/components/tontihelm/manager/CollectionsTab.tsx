"use client";
// TontiHelm — journal des encaissements (2026-10) : filtre par période (du … au …,
// raccourcis rapides), pagination, annulation par écriture inverse (M8) et export
// de l'historique PDF / Excel généré par le BACKEND (en-têtes et pieds de page
// structurés, totaux de période) sur la période et la méthode filtrées.
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MethodBadge } from "../StatusBadge";
import { CollectionsPage, formatFCFA } from "@/lib/types";
import { downloadFile, get, isOfflineQueued, post } from "@/lib/client";
import { useSyncDone } from "@/lib/offline/hooks";
import { ExportMenu } from "./ExportMenu";
import { Search, ChevronLeft, ChevronRight, Undo2, CalendarRange } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Période par défaut : le mois en cours. */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  return { from: dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: dayKey(now) };
}

export function CollectionsTab({ readOnly, structureName }: { readOnly: boolean; structureName: string }) {
  const [data, setData] = useState<CollectionsPage | null>(null);
  const [page, setPage] = useState(1);
  const [method, setMethod] = useState("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<{ from: string; to: string }>(defaultRange);
  const [reversalTarget, setReversalTarget] = useState<{ id: string; contributor: string; amount: number } | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // La période vide (chaîne vide) = tout l'historique.
  const fromParam = range.from ? `&from=${range.from}` : "";
  const toParam = range.to ? `&to=${range.to}` : "";

  const load = useCallback(async (p: number, m: string) => {
    try {
      const d = await get<CollectionsPage>(
        `/api/manager/collections?page=${p}&method=${m === "all" ? "" : m}${fromParam}${toParam}`
      );
      setData(d);
    } catch {
      toast({ title: "Journal indisponible", description: "Impossible de charger les encaissements." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

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

  /* ── Export de l'historique : PDF / Excel générés par le backend, sur la
     période et la méthode filtrées (en-tête, pied de page et totaux inclus). ── */
  async function exportHistory(format: "pdf" | "xlsx") {
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const period = range.from || range.to
        ? `${range.from || "debut"}_${range.to || "aujourdhui"}`
        : "tout";
      await downloadFile(
        `/api/manager/export/collections?format=${format}${fromParam}${toParam}` +
          (method === "all" ? "" : `&method=${method}`),
        `encaissements-${period}-${stamp}.${format}`
      );
      setTimeout(() => {
        toast({
          title: format === "pdf" ? "Historique PDF prêt." : "Historique Excel prêt.",
          description:
            range.from || range.to
              ? `Encaissements du ${new Date(`${range.from}T00:00:00`).toLocaleDateString("fr-FR")} au ${new Date(`${range.to}T00:00:00`).toLocaleDateString("fr-FR")}${method === "all" ? "" : ` · ${method === "cash" ? "espèces" : "mobile money"}`}.`
              : "Tout l'historique des paiements.",
        });
      }, 600);
    } catch (err) {
      toast({ title: "Export impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setExporting(false);
    }
  }

  function setPreset(kind: "today" | "week" | "month" | "all") {
    const now = new Date();
    if (kind === "today") setRange({ from: dayKey(now), to: dayKey(now) });
    else if (kind === "week") setRange({ from: dayKey(new Date(now.getTime() - 6 * 86400000)), to: dayKey(now) });
    else if (kind === "month") setRange(defaultRange());
    else setRange({ from: "", to: "" });
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const presetActive = (kind: "today" | "week" | "month" | "all") => {
    const now = new Date();
    if (kind === "today") return range.from === dayKey(now) && range.to === dayKey(now);
    if (kind === "week") return range.from === dayKey(new Date(now.getTime() - 6 * 86400000)) && range.to === dayKey(now);
    if (kind === "month") {
      const def = defaultRange();
      return range.from === def.from && range.to === def.to;
    }
    return range.from === "" && range.to === "";
  };

  void structureName;

  return (
    <div>
      {/* Filtres : période (du … au …) + méthodes + recherche */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un cotisant ou un carnet" className="h-11 border-line pl-9" aria-label="Rechercher" />
          </div>
          <div className="flex flex-wrap gap-2">
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
            <ExportMenu
              onExcel={() => exportHistory("xlsx")}
              onPdf={() => exportHistory("pdf")}
              busy={exporting}
              label="Exporter"
            />
          </div>
        </div>

        {/* Plage de dates + raccourcis */}
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <Label htmlFor="col-from" className="flex items-center gap-1 text-[11px] font-medium text-subtle">
                <CalendarRange className="h-3 w-3" aria-hidden /> Du
              </Label>
              <Input
                id="col-from"
                type="date"
                value={range.from}
                onChange={(e) => { setRange((r) => ({ ...r, from: e.target.value })); setPage(1); }}
                className="mt-1 h-10 w-[150px] border-line"
                aria-label="Début de période"
              />
            </div>
            <div>
              <Label htmlFor="col-to" className="text-[11px] font-medium text-subtle">Au</Label>
              <Input
                id="col-to"
                type="date"
                value={range.to}
                onChange={(e) => { setRange((r) => ({ ...r, to: e.target.value })); setPage(1); }}
                className="mt-1 h-10 w-[150px] border-line"
                aria-label="Fin de période"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Raccourcis de période">
            {([
              { id: "today", label: "Aujourd'hui" },
              { id: "week", label: "7 jours" },
              { id: "month", label: "Ce mois" },
              { id: "all", label: "Tout" },
            ] as const).map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  presetActive(p.id)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-line bg-white text-subtle hover:border-primary/40 hover:text-ink"
                )}
                aria-pressed={presetActive(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
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
              {data.total} écriture{data.total > 1 ? "s" : ""}
              {(range.from || range.to) && (
                <>
                  {" · "}
                  {range.from ? new Date(`${range.from}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "début"}
                  {" → "}
                  {range.to ? new Date(`${range.to}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "aujourd'hui"}
                </>
              )}
              {" · page "}{data.page}/{totalPages}
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
