"use client";
// TontiHelm — liste des carnets (M2) : mise journalière, durée du cycle, statut, solde.
// Chaque carnet s'ouvre en vue calendrier réel (marquage journalier dynamique).
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
import { get, post } from "@/lib/client";
import { BookOpen, Search, CalendarDays, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function PassbooksTab({ readOnly }: { readOnly: boolean }) {
  const [rows, setRows] = useState<PassbookRow[] | null>(null);
  const [contributors, setContributors] = useState<ContributorRow[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [openCarnetId, setOpenCarnetId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    contributorId: "", dailyAmount: "", cycleDays: "31", startsOn: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    get<{ passbooks: PassbookRow[] }>("/api/manager/passbooks")
      .then((d) => setRows(d.passbooks))
      .catch(() => toast({ title: "Liste indisponible", description: "Impossible de charger les carnets." }));
    get<{ contributors: ContributorRow[] }>("/api/manager/contributors")
      .then((d) => setContributors(d.contributors))
      .catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.toLowerCase();
    return rows.filter((r) => r.contributor.toLowerCase().includes(q) || r.number.includes(q) || (r.neighborhood ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  async function submit() {
    setSubmitting(true);
    try {
      await post("/api/manager/passbooks", {
        contributorId: form.contributorId,
        dailyAmount: parseInt(form.dailyAmount, 10) || 0,
        cycleDays: parseInt(form.cycleDays, 10) || 0,
        startsOn: form.startsOn,
      });
      toast({ title: "Carnet créé.", description: "Il apparaît dans la tournée de l'agent référent." });
      setOpen(false);
      setForm({ ...form, contributorId: "", dailyAmount: "" });
      const d = await get<{ passbooks: PassbookRow[] }>("/api/manager/passbooks");
      setRows(d.passbooks);
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
              <Button className="bg-primary text-primary-foreground hover:bg-[#0C5A3E]">
                <BookOpen className="h-4 w-4" aria-hidden /> Nouveau carnet
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display">Nouveau carnet</DialogTitle>
                <DialogDescription>Mise journalière, durée du cycle et date de début. La commission de la structure s'applique à la clôture du cycle.</DialogDescription>
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
                    <Label htmlFor="pb-cycle">Durée du cycle (jours)</Label>
                    <Input id="pb-cycle" inputMode="numeric" value={form.cycleDays} onChange={(e) => setForm({ ...form, cycleDays: e.target.value.replace(/\D/g, "") })} className="amount h-11 border-line" placeholder="31" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pb-start">Date de début</Label>
                  <Input id="pb-start" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} className="h-11 border-line" />
                </div>
                <p className="rounded-lg bg-[#F7F8F5] p-3 text-xs leading-relaxed text-subtle">
                  Commission de la structure : 1 jour de cotisation par cycle (paramétrable). Un cycle de 31
                  jours à 500 FCFA laisse 500 FCFA de commission et 15 000 FCFA restitués au cotisant.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="border-line">Annuler</Button>
                <Button onClick={submit} disabled={submitting || !form.contributorId} className="bg-primary text-primary-foreground hover:bg-[#0C5A3E]">
                  {submitting ? "Création…" : "Créer le carnet"}
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
                <TableHead>Mise / cycle</TableHead>
                <TableHead className="text-right">Solde</TableHead>
                <TableHead className="text-right">Jours</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Calendrier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="border-line">
                  <TableCell className="amount text-sm font-semibold text-ink">{r.number}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium text-ink">{r.contributor}</p>
                    <p className="text-xs text-subtle">{r.neighborhood}</p>
                  </TableCell>
                  <TableCell className="text-sm text-subtle">{r.agent}</TableCell>
                  <TableCell className="amount text-sm text-ink">
                    {formatFCFA(r.dailyAmount)} <span className="text-subtle">/ {r.cycleDays} j</span>
                  </TableCell>
                  <TableCell className="amount text-sm font-semibold text-ink">{formatFCFA(r.balance)}</TableCell>
                  <TableCell className="amount text-sm text-subtle">
                    {r.paidDays}/{r.cycleDays}
                    {r.missedDays > 0 && <span className="ml-1 font-semibold text-danger">−{r.missedDays}</span>}
                  </TableCell>
                  <TableCell><PassbookStatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-line"
                      onClick={() => setOpenCarnetId(r.id)}
                      aria-label={`Ouvrir le carnet calendrier de ${r.contributor}`}
                    >
                      <CalendarDays className="h-4 w-4" aria-hidden /> Carnet
                    </Button>
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
                  <p className="amount text-sm font-bold text-ink">Carnet {r.number}</p>
                  <p className="mt-0.5 text-sm text-ink">{r.contributor}</p>
                  <p className="text-xs text-subtle">{r.neighborhood} · {r.agent}</p>
                </div>
                <PassbookStatusBadge status={r.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-[#F7F8F5] px-3 py-2 text-xs">
                <span className="amount flex items-center gap-1 text-subtle"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {r.cycleDays} j</span>
                <span className="amount text-subtle">Mise {formatFCFA(r.dailyAmount)}</span>
                <span className="amount font-semibold text-ink">{formatFCFA(r.balance)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-subtle"><User className="h-3.5 w-3.5" aria-hidden /> {r.paidDays}/{r.cycleDays} jours payés</span>
                {r.missedDays > 0 && <span className="font-semibold text-danger">{r.missedDays} manqués</span>}
              </div>
              <Button
                variant="outline"
                className="mt-3 w-full border-line"
                onClick={() => setOpenCarnetId(r.id)}
                aria-label={`Ouvrir le carnet calendrier de ${r.contributor}`}
              >
                <CalendarDays className="h-4 w-4" aria-hidden /> Voir le carnet en calendrier
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Vue calendrier réel du carnet sélectionné */}
      <Dialog open={openCarnetId !== null} onOpenChange={(v) => !v && setOpenCarnetId(null)}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto border-line bg-canvas p-4 sm:max-w-3xl md:p-5 lg:max-w-4xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Carnet en calendrier réel</DialogTitle>
            <DialogDescription>Marquage journalier du carnet sur le calendrier calendaire.</DialogDescription>
          </DialogHeader>
          {openCarnetId && <CarnetCalendar passbookId={openCarnetId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
