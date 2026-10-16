"use client";
// TontiHelm — back-office YEHI OR Tech (§14.17, écran 12) : demandes de démonstration,
// file de validation des structures, visualisation du justificatif, approbation, refus avec motif, suspension.
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AdminStructure, DemoRequestRow, KIND_LABELS } from "@/lib/types";
import { get, isOfflineQueued, post } from "@/lib/client";
import { LogoWordmark } from "../Logo";
import { StatusBadge } from "../StatusBadge";
import { ShieldCheck, ShieldAlert, FileText, LogOut, Inbox, Building2, Users, Receipt, CalendarClock, Phone, MessageSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const DEMO_STATUS: Record<string, { label: string; tone: "info" | "success" | "warning" | "neutral" }> = {
  new: { label: "Nouvelle", tone: "info" },
  contacted: { label: "Contactée", tone: "warning" },
  converted: { label: "Convertie", tone: "success" },
  closed: { label: "Clôturée", tone: "neutral" },
};

export function AdminApp({ onLogout }: { onLogout: () => void }) {
  const [structures, setStructures] = useState<AdminStructure[] | null>(null);
  const [demoRequests, setDemoRequests] = useState<DemoRequestRow[] | null>(null);
  const [refuseTarget, setRefuseTarget] = useState<AdminStructure | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await get<{ structures: AdminStructure[] }>("/api/admin/structures");
      setStructures(d.structures);
    } catch {
      toast({ title: "File indisponible", description: "Impossible de charger les structures." });
    }
    try {
      const r = await get<{ requests: DemoRequestRow[] }>("/api/admin/demo-requests");
      setDemoRequests(r.requests);
    } catch {
      setDemoRequests([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(structureId: string, action: "approve" | "refuse" | "suspend" | "reactivate", note?: string) {
    setBusy(structureId);
    try {
      const res = await post<{ message: string }>("/api/admin/structures", { structureId, action, note });
      if (isOfflineQueued(res)) {
        toast({ title: "Décision enregistrée hors ligne.", description: "Elle partira au serveur dès le retour du réseau." });
      } else {
        toast({ title: res.message });
        await load();
      }
      setRefuseTarget(null);
      setNote("");
    } catch (err) {
      toast({ title: "Action impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setBusy(null);
    }
  }

  async function setDemoStatus(id: string, status: "contacted" | "converted" | "closed") {
    setBusy(id);
    try {
      await post("/api/admin/demo-requests", { id, status });
      setDemoRequests((prev) => prev?.map((r) => (r.id === id ? { ...r, status } : r)) ?? null);
      toast({ title: "Statut mis à jour." });
    } catch (err) {
      toast({ title: "Action impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setBusy(null);
    }
  }

  const pending = structures?.filter((s) => s.status === "pending") ?? [];
  const others = structures?.filter((s) => s.status !== "pending") ?? [];
  const newDemos = demoRequests?.filter((r) => r.status === "new") ?? [];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <LogoWordmark size={30} />
            <Badge variant="outline" className="rounded-md border-line bg-[#F4F7FB] px-2 py-0.5 text-xs font-medium text-subtle">
              Administration YEHI OR Tech
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={onLogout} className="border-line">
            <LogOut className="h-4 w-4" aria-hidden /> Quitter
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 md:px-6">
        {/* Demandes de démonstration */}
        <section>
          <h1 className="font-display flex items-center gap-2 text-xl font-bold text-ink">
            <CalendarClock className="h-5 w-5 tontihelm-icon text-primary" aria-hidden />
            Demandes de démonstration ({newDemos.length})
          </h1>
          <p className="mt-1 text-sm text-subtle">
            Gérants qui ont demandé à voir l'application avant de s'inscrire. Contacte-les sous 24 heures ouvrées.
          </p>

          {!demoRequests && (
            <div className="mt-4 space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
          )}

          <div className="mt-4 space-y-3">
            {demoRequests && demoRequests.length === 0 && (
              <Card className="border-line">
                <CardContent className="p-6 text-sm text-subtle">
                  Aucune demande de démonstration pour le moment.
                </CardContent>
              </Card>
            )}
            {demoRequests?.map((r) => (
              <Card key={r.id} className="border-line">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{r.structure}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden /> {r.fullName}</span>
                        <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden /> {r.phone}</span>
                        {r.city && <span>{r.city}</span>}
                        {r.contributors != null && <span>≈ {r.contributors} cotisants</span>}
                        {r.agents != null && <span>{r.agents} agents</span>}
                      </p>
                      {r.message && <p className="mt-2 rounded-md bg-[#F4F7FB] p-2.5 text-xs text-subtle">« {r.message} »</p>}
                      <p className="mt-1.5 text-[11px] text-subtle">
                        Reçue le {new Date(r.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge label={DEMO_STATUS[r.status]?.label ?? r.status} tone={DEMO_STATUS[r.status]?.tone ?? "neutral"} />
                      <div className="flex flex-wrap gap-1.5">
                        {r.status === "new" && (
                          <a
                            href={`https://wa.me/${r.phone.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#25D366]/60 bg-[#E9F9EF] px-2.5 text-xs font-semibold text-[#128C4A] transition-colors hover:bg-[#D2F2DE]"
                          >
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Contacter
                          </a>
                        )}
                        {r.status !== "converted" && r.status !== "closed" && (
                          <>
                            {r.status === "new" && (
                              <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => setDemoStatus(r.id, "contacted")} className="h-8 border-line text-xs">
                                Marquer contactée
                              </Button>
                            )}
                            {r.status === "contacted" && (
                              <Button size="sm" disabled={busy === r.id} onClick={() => setDemoStatus(r.id, "converted")} className="h-8 bg-primary text-xs text-primary-foreground hover:bg-primary-hover">
                                Convertie
                              </Button>
                            )}
                          </>
                        )}
                        {r.status !== "closed" && (
                          <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => setDemoStatus(r.id, "closed")} className="h-8 border-line text-xs">
                            Clôturer
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* File de validation */}
        <section>
          <h1 className="font-display flex items-center gap-2 text-xl font-bold text-ink">
            <Inbox className="h-5 w-5 tontihelm-icon text-primary" aria-hidden />
            File de validation ({pending.length})
          </h1>
          <p className="mt-1 text-sm text-subtle">
            Chaque structure s'inscrit avec son justificatif d'agrément. Le compte reste en attente
            jusqu'à validation manuelle.
          </p>

          {!structures && (
            <div className="mt-4 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>
          )}

          <div className="mt-4 space-y-4">
            {pending.map((s) => (
              <Card key={s.id} className="border-line">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-bold text-ink">{s.name}</p>
                      <p className="text-sm text-subtle">{KIND_LABELS[s.kind] ?? s.kind} · {s.city}</p>
                      {s.owner && (
                        <p className="amount mt-1 text-sm text-ink">
                          {s.owner.fullName} · {s.owner.phone}
                        </p>
                      )}
                    </div>
                    <StatusBadge label="En attente" tone="warning" />
                  </div>

                  <div className="mt-4 grid gap-3 rounded-lg border border-line bg-[#F4F7FB] p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-subtle">Référence de l'agrément</p>
                      <p className="mt-1 text-sm font-medium text-ink">{s.licenseRef}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-subtle">Justificatif joint</p>
                      <p className="mt-1 flex items-center gap-2 text-sm text-ink">
                        <FileText className="h-4 w-4 tontihelm-icon text-primary" aria-hidden />
                        {s.licenseDocName ?? "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">
                        Demande envoyée le {new Date(s.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      onClick={() => act(s.id, "approve")}
                      disabled={busy === s.id}
                      className="bg-primary text-primary-foreground hover:bg-primary-hover"
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden /> Valider et activer
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setRefuseTarget(s)}
                      disabled={busy === s.id}
                      className="border-danger text-danger hover:bg-[#FDECEA] hover:text-danger"
                    >
                      <ShieldAlert className="h-4 w-4" aria-hidden /> Refuser
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {structures && pending.length === 0 && (
              <Card className="border-line">
                <CardContent className="p-6 text-sm text-subtle">
                  Aucune structure en attente. La file est vide.
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* Structures actives et fermées */}
        <section>
          <h2 className="font-display flex items-center gap-2 text-lg font-bold text-ink">
            <Building2 className="h-5 w-5 tontihelm-icon text-primary" aria-hidden />
            Structures ({others.length})
          </h2>
          <div className="mt-4 space-y-3">
            {others.map((s) => (
              <Card key={s.id} className="border-line">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{s.name}</p>
                      {s.status === "active" && <StatusBadge label="Active" tone="success" />}
                      {s.status === "suspended" && <StatusBadge label="Suspendue" tone="danger" />}
                      {s.status === "closed" && <StatusBadge label="Refusée" tone="neutral" />}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden /> {s.counts.contributors} cotisants</span>
                      <span className="flex items-center gap-1"><Receipt className="h-3.5 w-3.5" aria-hidden /> {s.counts.collections} encaissements</span>
                      <span>{KIND_LABELS[s.kind]?.split(" ")[0]} · {s.city}</span>
                      {s.rejectionNote && <span className="text-danger">Motif : {s.rejectionNote}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {s.status === "active" && (
                      <Button variant="outline" size="sm" disabled={busy === s.id} onClick={() => act(s.id, "suspend", "Suspension administrative")} className="border-line text-danger hover:bg-[#FDECEA] hover:text-danger">
                        Suspendre
                      </Button>
                    )}
                    {s.status === "suspended" && (
                      <Button variant="outline" size="sm" disabled={busy === s.id} onClick={() => act(s.id, "reactivate")} className="border-line text-primary hover:bg-[#E8F1FD] hover:text-primary">
                        Réactiver
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      {/* Refus avec motif */}
      <Dialog open={refuseTarget !== null} onOpenChange={(o) => !o && setRefuseTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Refuser cette demande ?</DialogTitle>
            <DialogDescription>
              {refuseTarget?.name}. Le motif est communiqué au dirigeant. La structure pourra corriger
              et représenter sa demande.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="refuse-note" className="text-sm font-medium text-ink">Motif du refus</label>
            <Textarea
              id="refuse-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Justificatif illisible, référence d'agrément introuvable…"
              rows={3}
              className="border-line"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefuseTarget(null)} className="border-line">Fermer</Button>
            <Button
              variant="destructive"
              onClick={() => refuseTarget && act(refuseTarget.id, "refuse", note)}
              disabled={busy !== null || note.trim().length < 3}
              className="bg-danger hover:bg-[#B3261E]"
            >
              Refuser la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
