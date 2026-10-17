"use client";
// TontiHelm — liste des carnets (livrets annuels) : mise journalière, feuille en
// cours, statut, solde. Chaque carnet s'ouvre en vue livret (12 feuilles + récap)
// avec préparation de la remise de fin de souscription.
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
import { CarnetCalendar } from "./CarnetCalendar";
import { ContributorRow, PassbookRow, formatFCFA } from "@/lib/types";
import { get, isOfflineQueued, post } from "@/lib/client";
import { useSyncDone } from "@/lib/offline/hooks";
import { BookOpen, Search, CalendarDays, BellRing } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function PassbooksTab({ readOnly }: { readOnly: boolean }) {
  const [rows, setRows] = useState<PassbookRow[] | null>(null);
  const [contributors, setContributors] = useState<ContributorRow[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [openCarnetId, setOpenCarnetId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    contributorId: "", dailyAmount: "", label: "",
  });

  const load = () => {
    get<{ passbooks: PassbookRow[] }>("/api/manager/passbooks")
      .then((d) => setRows(d.passbooks))
      .catch(() => toast({ title: "Liste indisponible", description: "Impossible de charger les carnets." }));
  };

  useEffect(() => {
    load();
    get<{ contributors: ContributorRow[] }>("/api/manager/contributors")
      .then((d) => setContributors(d.contributors))
      .catch(() => undefined);
  }, []);

  useSyncDone(load);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.toLowerCase();
    return rows.filter((r) => r.contributor.toLowerCase().includes(q) || r.number.includes(q) || (r.neighborhood ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  const [reminding, setReminding] = useState<string | null>(null);

  /* Relance WhatsApp du cotisant en retard (paliers Pro et Institution) :
     le message est pré-rempli avec le lien de son carnet. */
  async function remind(r: PassbookRow) {
    setReminding(r.id);
    try {
      const res = await post<{ message: string; whatsappUrl?: string }>(`/api/manager/passbooks/${r.id}/remind`, {});
      if (isOfflineQueued(res)) {
        toast({ title: "Enregistré hors ligne.", description: "La relance partira au serveur dès le retour du réseau." });
      } else if (res.whatsappUrl) {
        window.open(res.whatsappUrl, "_blank", "noopener,noreferrer");
        toast({ title: "Relance WhatsApp prête.", description: "Vérifie le message pré-rempli et envoie-le au cotisant." });
      } else {
        toast({ title: "Relance prête.", description: res.message });
      }
    } catch (err) {
      toast({ title: "Relance impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setReminding(null);
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const res = await post("/api/manager/passbooks", {
        contributorId: form.contributorId,
        dailyAmount: parseInt(form.dailyAmount, 10) || 0,
        label: form.label.trim(),
      });
      if (isOfflineQueued(res)) {
        toast({ title: "Enregistré hors ligne.", description: "Le carnet partira au serveur dès le retour du réseau." });
      } else {
        toast({ title: "Livret annuel créé.", description: "12 feuilles mensuelles démarrent ce mois-ci — visible dans la tournée de l'agent référent." });
        load();
      }
      setOpen(false);
      setForm({ ...form, contributorId: "", dailyAmount: "", label: "" });
    } catch (err) {
      toast({ title: "Création impossible", description: err instanceof Error ? err.message : "Réessaie." });
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
            placeholder="Rechercher un carnet ou un cotisant"
            className="h-11 border-line pl-9"
            aria-label="Rechercher un carnet"
          />
        </div>
        {!readOnly && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary-hover">
                <BookOpen className="h-4 w-4" aria-hidden /> Nouveau carnet
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display">Nouveau carnet (livret annuel)</DialogTitle>
                <DialogDescription>Choisis le cotisant et sa mise journalière : le livret de 12 feuilles mensuelles démarre automatiquement au mois en cours, avec sa 13e feuille de récapitulatif.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Cotisant</Label>
                  <Select value={form.contributorId} onValueChange={(v) => setForm({ ...form, contributorId: v })}>
                    <SelectTrigger className="h-11 border-line" aria-label="Cotisant">
                      <SelectValue placeholder="Choisis le cotisant" />
                    </SelectTrigger>
                    <SelectContent>
                      {contributors.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.fullName} · {c.neighborhood}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pb-amount">Mise journalière (FCFA)</Label>
                    <Input id="pb-amount" inputMode="numeric" value={form.dailyAmount} onChange={(e) => setForm({ ...form, dailyAmount: e.target.value.replace(/\D/g, "") })} className="amount h-11 border-line" placeholder="500" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pb-label">Surnom du carnet</Label>
                    <Input id="pb-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="h-11 border-line" placeholder="Boutique, école…" />
                  </div>
                </div>
                <p className="rounded-lg bg-[#F4F7FB] p-3 text-xs leading-relaxed text-subtle">
                  Chaque feuille mensuelle compte 31 mises : les 30 premières créditent le cotisant, la 31e
                  revient à l&apos;entreprise (marquée, sans inscription). Sur l&apos;année : 12 mises pour
                  l&apos;entreprise, le reste lui est restitué à la fin de sa souscription (signature numérique).
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="border-line">Annuler</Button>
                <Button onClick={submit} disabled={submitting || !form.contributorId} className="bg-primary text-primary-foreground hover:bg-primary-hover">
                  {submitting ? "Création…" : "Créer le livret annuel"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Tableau bureau */}
      <Card className="hidden border-line md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-line">
                <TableHead>Carnet</TableHead>
                <TableHead>Cotisant</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Mise / livret</TableHead>
                <TableHead className="text-right">Solde</TableHead>
                <TableHead className="text-right">Feuille / lignes</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="border-line">
                  <TableCell className="amount text-sm font-semibold text-ink">
                    {r.number}
                    {r.label && <p className="text-xs font-normal text-subtle">{r.label}</p>}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium text-ink">{r.contributor}</p>
                    <p className="text-xs text-subtle">{r.neighborhood}</p>
                  </TableCell>
                  <TableCell className="text-sm text-subtle">{r.agent}</TableCell>
                  <TableCell className="amount text-sm text-ink">
                    {formatFCFA(r.dailyAmount)} <span className="text-subtle">/ an</span>
                  </TableCell>
                  <TableCell className="amount text-sm font-semibold text-ink">{formatFCFA(r.balance)}</TableCell>
                  <TableCell className="amount text-sm text-subtle">
                    F{r.currentSheet}/12 · {r.coveredLines}/372
                    {r.missedLines > 0 && <span className="ml-1 font-semibold text-danger">−{r.missedLines}</span>}
                  </TableCell>
                  <TableCell><PassbookStatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.missedLines > 0 && r.status === "late" && r.phone && !readOnly && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-[#25D366]/60 bg-[#E9F9EF] text-[#128C4A] hover:bg-[#D2F2DE] hover:text-[#128C4A]"
                          disabled={reminding === r.id}
                          onClick={() => remind(r)}
                          aria-label={`Relancer ${r.contributor} par WhatsApp`}
                          title={`Relance WhatsApp : ${r.missedLines} lignes manquées`}
                        >
                          <BellRing className="h-4 w-4" aria-hidden /> <span className="hidden xl:inline">Relancer</span>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-line"
                        onClick={() => setOpenCarnetId(r.id)}
                        aria-label={`Ouvrir le livret de ${r.contributor}`}
                      >
                        <CalendarDays className="h-4 w-4" aria-hidden /> Livret
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cartes mobile */}
      <div className="space-y-3 md:hidden">
        {filtered.map((r) => (
          <Card key={r.id} className="border-line">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="amount text-sm font-bold text-ink">Carnet {r.number}{r.label ? ` · ${r.label}` : ""}</p>
                  <p className="mt-0.5 text-sm text-ink">{r.contributor}</p>
                  <p className="text-xs text-subtle">{r.neighborhood} · {r.agent}</p>
                </div>
                <PassbookStatusBadge status={r.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-[#F4F7FB] px-3 py-2 text-xs">
                <span className="amount flex items-center gap-1 text-subtle"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> F{r.currentSheet}/12</span>
                <span className="amount text-subtle">Mise {formatFCFA(r.dailyAmount)}</span>
                <span className="amount font-semibold text-ink">{formatFCFA(r.balance)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="amount text-subtle">{r.coveredLines}/372 lignes couvertes</span>
                {r.missedLines > 0 && <span className="font-semibold text-danger">{r.missedLines} manquées</span>}
              </div>
              {r.missedLines > 0 && r.status === "late" && r.phone && !readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full border-[#25D366]/60 bg-[#E9F9EF] text-[#128C4A] hover:bg-[#D2F2DE] hover:text-[#128C4A]"
                  disabled={reminding === r.id}
                  onClick={() => remind(r)}
                >
                  <BellRing className="h-4 w-4" aria-hidden /> Relancer par WhatsApp : {r.missedLines} lignes manquées
                </Button>
              )}
              <Button
                variant="outline"
                className="mt-3 w-full border-line"
                onClick={() => setOpenCarnetId(r.id)}
                aria-label={`Ouvrir le livret de ${r.contributor}`}
              >
                <CalendarDays className="h-4 w-4" aria-hidden /> Voir le livret annuel
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Vue livret annuel du carnet sélectionné */}
      <Dialog open={openCarnetId !== null} onOpenChange={(v) => !v && setOpenCarnetId(null)}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto border-line bg-canvas p-4 sm:max-w-3xl md:p-5 lg:max-w-4xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Livret annuel du carnet</DialogTitle>
            <DialogDescription>12 feuilles mensuelles, récapitulatif et fin de souscription.</DialogDescription>
          </DialogHeader>
          {openCarnetId && <CarnetCalendar passbookId={openCarnetId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
