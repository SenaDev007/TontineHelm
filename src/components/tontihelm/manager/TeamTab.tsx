"use client";
// TontiHelm — équipe de collecte : comptes agents de la structure (création par le gérant).
// Un agent reçoit son numéro + code PIN et se connecte sur l'application mobile.
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { get, post } from "@/lib/client";
import { UserPlus, Users, Phone, Wallet } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AgentRow {
  id: string;
  fullName: string;
  phone: string;
}

export function TeamTab({ readOnly }: { readOnly: boolean }) {
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", pin: "" });

  useEffect(() => {
    get<{ users: AgentRow[] }>("/api/manager/agents")
      .then((d) => setAgents(d.users))
      .catch(() => toast({ title: "Équipe indisponible", description: "Impossible de charger les agents." }));
  }, []);

  async function submit() {
    setSubmitting(true);
    try {
      await post("/api/manager/agents", {
        fullName: form.fullName,
        phone: form.phone,
        pin: form.pin,
      });
      toast({
        title: "Agent créé.",
        description: "Transmets-lui son numéro et son code PIN : il se connecte comme agent collecteur.",
      });
      setOpen(false);
      setForm({ fullName: "", phone: "", pin: "" });
      const d = await get<{ users: AgentRow[] }>("/api/manager/agents");
      setAgents(d.users);
    } catch (err) {
      toast({ title: "Création impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setSubmitting(false);
    }
  }

  if (!agents) {
    return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm leading-relaxed text-subtle">
          Chaque agent de collecte reçoit un compte (numéro + code PIN). Il démarre sa tournée sur
          l&apos;application mobile, encaisse chez les cotisants et marque les carnets — même hors réseau.
        </p>
        {!readOnly && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-[#0C5A3E]">
                <UserPlus className="h-4 w-4" aria-hidden /> Nouvel agent
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Créer un compte agent</DialogTitle>
                <DialogDescription>
                  L&apos;agent se connecte avec son numéro de téléphone et ce code PIN à 6 chiffres.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ag-name">Nom complet</Label>
                  <Input
                    id="ag-name"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="h-11 border-line"
                    placeholder="Cossi ADJOVI"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ag-phone">Numéro de téléphone</Label>
                  <Input
                    id="ag-phone"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="h-11 border-line"
                    placeholder="+229 97 01 02 03"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ag-pin">Code PIN (6 chiffres)</Label>
                  <Input
                    id="ag-pin"
                    inputMode="numeric"
                    maxLength={6}
                    value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                    className="amount h-11 border-line"
                    placeholder="••••••"
                  />
                  <p className="text-xs text-subtle">
                    À transmettre à l&apos;agent en main propre. Il pourra le changer plus tard.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="border-line">Annuler</Button>
                <Button
                  onClick={submit}
                  disabled={submitting || form.fullName.length < 2 || form.phone.replace(/\s+/g, "").length < 8 || form.pin.length !== 6}
                  className="bg-primary text-primary-foreground hover:bg-[#0C5A3E]"
                >
                  {submitting ? "Création…" : "Créer l'agent"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {agents.length === 0 ? (
        <Card className="border-dashed border-line bg-white">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EDF1EA] text-primary">
              <Users className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-display font-bold text-ink">Aucun agent pour l&apos;instant</p>
            <p className="max-w-sm text-sm text-subtle">
              Crée le premier compte agent : il pourra ensuite se voir affecter des cotisants et
              démarrer ses tournées de collecte.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <Card key={a.id} className="border-line bg-white">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EDF1EA] font-display text-sm font-bold text-primary">
                      {a.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{a.fullName}</p>
                      <p className="amount flex items-center gap-1 text-xs text-subtle">
                        <Phone className="h-3 w-3" aria-hidden /> {a.phone}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#E7F3EB] px-2 py-0.5 text-[11px] font-semibold text-primary">
                    <Wallet className="h-3 w-3" aria-hidden /> Agent
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
