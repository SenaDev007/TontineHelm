"use client";
// TontiHelm — liste des cotisants et fiche (M2, écran 6) : tableau au bureau, cartes empilées sur mobile.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PassbookStatusBadge } from "../StatusBadge";
import { ContributorRow, formatFCFA } from "@/lib/types";
import { get, post } from "@/lib/client";
import { UserPlus, Search, Phone, MapPin, IdCard } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function ContributorsTab({ readOnly }: { readOnly: boolean }) {
  const [rows, setRows] = useState<ContributorRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<{ id: string; fullName: string }[]>([]);
  const [form, setForm] = useState({ fullName: "", phone: "", neighborhood: "", idNumber: "", agentId: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    get<{ contributors: ContributorRow[] }>("/api/manager/contributors")
      .then((d) => setRows(d.contributors))
      .catch(() => toast({ title: "Liste indisponible", description: "Impossible de charger les cotisants." }));
    // Agents de la structure pour le formulaire de création.
    get<{ users: { id: string; fullName: string }[] }>("/api/manager/agents")
      .then((d) => setAgents(d.users))
      .catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.toLowerCase();
    return rows.filter((r) => r.fullName.toLowerCase().includes(q) || (r.neighborhood ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  async function submit() {
    setSubmitting(true);
    try {
      await post("/api/manager/contributors", form);
      toast({ title: "Cotisant enregistré.", description: `${form.fullName} est rattaché à l'agent choisi.` });
      setOpen(false);
      setForm({ fullName: "", phone: "", neighborhood: "", idNumber: "", agentId: "" });
      const d = await get<{ contributors: ContributorRow[] }>("/api/manager/contributors");
      setRows(d.contributors);
    } catch (err) {
      toast({ title: "Enregistrement impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setSubmitting(false);
    }
  }

  if (!rows) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un cotisant ou un quartier"
            className="h-11 border-line pl-9"
            aria-label="Rechercher un cotisant"
          />
        </div>
        {!readOnly && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary-hover">
                <UserPlus className="h-4 w-4" aria-hidden /> Nouveau cotisant
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display">Nouveau cotisant</DialogTitle>
                <DialogDescription>Fiche cotisant : identité, téléphone, quartier, pièce d'identité, agent référent.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="c-name">Nom complet</Label>
                  <Input id="c-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="h-11 border-line" placeholder="Adjovi Marie" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="c-phone">Téléphone</Label>
                    <Input id="c-phone" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11 border-line" placeholder="+229 96 15 01 01" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-area">Quartier</Label>
                    <Input id="c-area" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} className="h-11 border-line" placeholder="Albarika" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-id">Numéro de pièce d'identité</Label>
                  <Input id="c-id" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} className="h-11 border-line" placeholder="CI-1187452" />
                  <p className="text-xs text-subtle">Numéro seul, sans image au MVP.</p>
                </div>
                <div className="space-y-2">
                  <Label>Agent référent</Label>
                  <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v })}>
                    <SelectTrigger className="h-11 border-line" aria-label="Agent référent">
                      <SelectValue placeholder="Choisis l'agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="border-line">Annuler</Button>
                <Button onClick={submit} disabled={submitting} className="bg-primary text-primary-foreground hover:bg-primary-hover">
                  {submitting ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Tableau au bureau (≥768 px) */}
      <Card className="hidden border-line md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-line">
                <TableHead>Cotisant</TableHead>
                <TableHead>Quartier</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Carnet</TableHead>
                <TableHead className="text-right">Solde</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="border-line">
                  <TableCell>
                    <p className="text-sm font-medium text-ink">{r.fullName}</p>
                    <p className="amount flex items-center gap-1 text-xs text-subtle">
                      <Phone className="h-3 w-3" aria-hidden /> {r.phone ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-subtle">{r.neighborhood}</TableCell>
                  <TableCell className="text-sm text-subtle">{r.agent}</TableCell>
                  <TableCell>
                    {r.passbook ? (
                      <>
                        <p className="amount text-sm text-ink">{r.passbook.number}</p>
                        <p className="text-xs text-subtle">Jour {r.passbook.paidDays}/{r.passbook.cycleDays}</p>
                      </>
                    ) : (
                      <span className="text-xs text-subtle">Aucun carnet</span>
                    )}
                  </TableCell>
                  <TableCell className="amount text-sm font-semibold text-ink">
                    {r.passbook ? formatFCFA(r.passbook.balance) : "—"}
                  </TableCell>
                  <TableCell>
                    {r.passbook ? <PassbookStatusBadge status={r.passbook.status} /> : <span className="text-xs text-subtle">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cartes empilées sur mobile */}
      <div className="space-y-3 md:hidden">
        {filtered.map((r) => (
          <Card key={r.id} className="border-line">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[15px] font-semibold text-ink">{r.fullName}</p>
                  <p className="amount mt-0.5 text-xs text-subtle">{r.phone ?? "—"}</p>
                </div>
                {r.passbook && <PassbookStatusBadge status={r.passbook.status} />}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <span className="flex items-center gap-1 text-subtle"><MapPin className="h-3.5 w-3.5" aria-hidden /> {r.neighborhood}</span>
                <span className="flex items-center gap-1 text-subtle"><IdCard className="h-3.5 w-3.5" aria-hidden /> {r.idNumber}</span>
                <span className="text-subtle">Agent : {r.agent}</span>
              </div>
              {r.passbook && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-[#F4F7FB] px-3 py-2">
                  <span className="text-xs text-subtle">Carnet {r.passbook.number} · Jour {r.passbook.paidDays}/{r.passbook.cycleDays}</span>
                  <span className="amount text-sm font-semibold text-ink">{formatFCFA(r.passbook.balance)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
