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
import { ShareLinkDialog } from "../ShareLinkSheet";
import { ContributorRow, formatFCFA } from "@/lib/types";
import { get, isOfflineQueued, post } from "@/lib/client";
import { useSyncDone } from "@/lib/offline/hooks";
import { usePlanQuota } from "./usePlanQuota";
import { UserPlus, Search, Phone, MapPin, IdCard, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function ContributorsTab({ readOnly, structureName }: { readOnly: boolean; structureName: string }) {
  const [rows, setRows] = useState<ContributorRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<{ id: string; fullName: string }[]>([]);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", neighborhood: "", idNumber: "", agentId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [share, setShare] = useState<{
    fullName: string;
    phone: string | null;
    email: string | null;
    passbookNumber: string | null;
    url: string;
  } | null>(null);
  const quota = usePlanQuota();
  const contributorsQuotaReached =
    !readOnly && quota !== null && (rows?.length ?? 0) >= quota.usage.contributorsQuota;

  const load = () => {
    get<{ contributors: ContributorRow[] }>("/api/manager/contributors")
      .then((d) => setRows(d.contributors))
      .catch(() => toast({ title: "Liste indisponible", description: "Impossible de charger les cotisants." }));
  };

  useEffect(() => {
    load();
    // Agents de la structure pour le formulaire de création.
    get<{ users: { id: string; fullName: string; role: string }[] }>("/api/manager/agents")
      .then((d) => setAgents(d.users.filter((u) => u.role === "agent")))
      .catch(() => undefined);
  }, []);

  // Rafraîchissement automatique quand la file d'envoi a été synchronisée.
  useSyncDone(load);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.toLowerCase();
    return rows.filter((r) => r.fullName.toLowerCase().includes(q) || (r.neighborhood ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  async function openShare(row: ContributorRow) {
    try {
      let url = row.shareUrl;
      if (!url) {
        const res = await post<{ url: string }>(`/api/manager/contributors/${row.id}/share`, {});
        url = res.url;
      }
      setShare({
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        passbookNumber: row.passbook?.number ?? null,
        url,
      });
    } catch (err) {
      toast({ title: "Lien indisponible", description: err instanceof Error ? err.message : "Réessaie." });
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const res = await post<{ contributor?: { fullName: string }; shareUrl?: string }>("/api/manager/contributors", { ...form, email: form.email.trim() || "" });
      if (isOfflineQueued(res)) {
        toast({
          title: "Enregistré hors ligne.",
          description: `${form.fullName} partira au serveur dès le retour du réseau.`,
        });
      } else {
        toast({ title: "Cotisant enregistré.", description: `${form.fullName} est rattaché à l'agent choisi.` });
        if (res?.shareUrl) {
          setShare({
            fullName: form.fullName,
            phone: form.phone,
            email: form.email || null,
            passbookNumber: null,
            url: res.shareUrl,
          });
        }
        load();
      }
      setOpen(false);
      setForm({ fullName: "", phone: "", email: "", neighborhood: "", idNumber: "", agentId: "" });
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
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {quota && (
              <p className="text-xs font-medium text-subtle" aria-live="polite">
                {rows?.length ?? 0} cotisant{(rows?.length ?? 0) > 1 ? "s" : ""} sur {quota.usage.contributorsQuota} inclus
                <span className="text-subtle"> · palier {quota.planLabel}</span>
              </p>
            )}
            {contributorsQuotaReached ? (
              <p className="max-w-xs rounded-md border border-[#F0D48A] bg-[#FFF4D6] px-3 py-2 text-xs font-medium text-[#A66A00]">
                Palier atteint : passe au palier supérieur (onglet Abonnement) pour enregistrer d&apos;autres cotisants.
              </p>
            ) : (
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
                  <Label htmlFor="c-phone">Téléphone (WhatsApp)</Label>
                  <Input id="c-phone" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11 border-line" placeholder="+229 96 15 01 01" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-email">E-mail (facultatif)</Label>
                  <Input id="c-email" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 border-line" placeholder="client@exemple.bj" />
                  <p className="text-xs text-subtle">Le lien du carnet part par WhatsApp ; l&apos;e-mail permet aussi le courriel.</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-area">Quartier</Label>
                <Input id="c-area" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} className="h-11 border-line" placeholder="Albarika" />
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
                <TableHead className="text-right">Lien du carnet</TableHead>
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
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[#9ED9D3] bg-[#F0FBFA] text-primary hover:bg-[#DFF6F4] hover:text-primary"
                      onClick={() => openShare(r)}
                      aria-label={`Lien du carnet de ${r.fullName}`}
                      title="Partager le lien du carnet (WhatsApp / e-mail)"
                    >
                      <Link2 className="h-4 w-4" aria-hidden /> <span className="hidden xl:inline">Partager</span>
                    </Button>
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
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full border-[#9ED9D3] bg-[#F0FBFA] text-primary hover:bg-[#DFF6F4] hover:text-primary"
                onClick={() => openShare(r)}
              >
                <Link2 className="h-4 w-4" aria-hidden /> Lien du carnet (WhatsApp / e-mail)
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Partage du lien de carnet */}
      <ShareLinkDialog
        open={share !== null}
        onOpenChange={(v) => !v && setShare(null)}
        url={share?.url ?? ""}
        contributorName={share?.fullName ?? ""}
        structureName={structureName}
        phone={share?.phone ?? null}
        email={share?.email ?? null}
        passbookNumber={share?.passbookNumber ?? null}
      />
    </div>
  );
}
