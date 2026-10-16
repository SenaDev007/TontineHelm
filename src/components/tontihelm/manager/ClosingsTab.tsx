"use client";
// TontiHelm — validation des clôtures et écarts (M5, écran 7).
// Le gérant valide ou conteste. Une clôture validée ne se modifie plus.
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClosingStatusBadge, GapBadge } from "../StatusBadge";
import { ClosingRow, formatFCFA } from "@/lib/types";
import { get, isOfflineQueued, post } from "@/lib/client";
import { useSyncDone } from "@/lib/offline/hooks";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function ClosingsTab({ readOnly }: { readOnly: boolean }) {
  const [rows, setRows] = useState<ClosingRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await get<{ closings: ClosingRow[] }>("/api/manager/closings");
      setRows(d.closings);
    } catch {
      toast({ title: "Liste indisponible", description: "Impossible de charger les clôtures." });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSyncDone(load);

  async function act(closingId: string, action: "validate" | "contest") {
    setBusy(closingId);
    try {
      const res = await post<{ message: string }>("/api/manager/closings", { action, closingId });
      if (isOfflineQueued(res)) {
        toast({ title: "Décision enregistrée hors ligne.", description: "Elle partira au serveur dès le retour du réseau." });
      } else {
        toast({ title: res.message });
        await load();
      }
    } catch (err) {
      toast({ title: "Action impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setBusy(null);
    }
  }

  if (!rows) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  }

  const pending = rows.filter((r) => r.status === "declared" || r.status === "disputed");
  const validated = rows.filter((r) => r.status === "validated");

  return (
    <div className="space-y-6">
      {/* Clôtures en attente de décision */}
      <section>
        <h2 className="font-display mb-3 text-base font-bold text-ink">À valider ({pending.length})</h2>
        {pending.length === 0 && (
          <Card className="border-line">
            <CardContent className="p-6 text-sm text-subtle">Aucune clôture en attente. Les caisses du jour sont à jour.</CardContent>
          </Card>
        )}
        <div className="space-y-3">
          {pending.map((c) => (
            <Card key={c.id} className={c.gap === 0 ? "border-line" : "border-[#F5C6C0]"}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {new Date(c.day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    <p className="text-xs text-subtle">Caisse déclarée par {c.agent}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClosingStatusBadge status={c.status} />
                    <GapBadge gap={c.gap} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-[#F4F7FB] px-2 py-2">
                    <p className="text-xs text-subtle">Déclaré</p>
                    <p className="amount text-sm font-semibold text-ink">{formatFCFA(c.declaredCash)}</p>
                  </div>
                  <div className="rounded-lg bg-[#F4F7FB] px-2 py-2">
                    <p className="text-xs text-subtle">Attendu</p>
                    <p className="amount text-sm font-semibold text-ink">{formatFCFA(c.expectedCash)}</p>
                  </div>
                  <div className={`rounded-lg px-2 py-2 ${c.gap === 0 ? "bg-[#DFF6F4]" : "bg-[#FDECEA]"}`}>
                    <p className="text-xs text-subtle">Écart</p>
                    <p className={`amount text-sm font-bold ${c.gap === 0 ? "text-success" : "text-danger"}`}>{formatFCFA(c.gap)}</p>
                  </div>
                </div>
                {!readOnly && (
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => act(c.id, "validate")}
                      disabled={busy === c.id}
                      className="bg-primary text-primary-foreground hover:bg-primary-hover"
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden /> Valider la clôture
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act(c.id, "contest")}
                      disabled={busy === c.id}
                      className="border-danger text-danger hover:bg-[#FDECEA] hover:text-danger"
                    >
                      <ShieldAlert className="h-4 w-4" aria-hidden /> Contester
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Historique validé */}
      <section>
        <h2 className="font-display mb-3 text-base font-bold text-ink">Historique</h2>
        <Card className="border-line">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-line">
                  <TableHead>Jour</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Déclaré</TableHead>
                  <TableHead className="text-right">Attendu</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validated.map((c) => (
                  <TableRow key={c.id} className="border-line">
                    <TableCell className="text-sm text-ink">
                      {new Date(c.day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </TableCell>
                    <TableCell className="text-sm text-subtle">{c.agent}</TableCell>
                    <TableCell className="amount text-sm text-ink">{formatFCFA(c.declaredCash)}</TableCell>
                    <TableCell className="amount text-sm text-ink">{formatFCFA(c.expectedCash)}</TableCell>
                    <TableCell className={`amount text-sm font-semibold ${c.gap === 0 ? "text-success" : "text-danger"}`}>
                      {formatFCFA(c.gap)}
                    </TableCell>
                    <TableCell><ClosingStatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
