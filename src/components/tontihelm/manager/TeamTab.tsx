"use client";
// TontiHelm — équipe de la structure : comptes agents collecteurs ET gérants.
// Le dirigeant (administrateur principal) crée les comptes gérant (back-office)
// et les comptes agents ; le gérant crée les comptes agents de sa collecte.
// Chaque membre reçoit son numéro + code PIN et se connecte sur son espace.
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { get, isOfflineQueued, post } from "@/lib/client";
import { useSyncDone } from "@/lib/offline/hooks";
import { usePlanQuota } from "./usePlanQuota";
import { UserPlus, Users, Phone, Wallet, UserCog } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface MemberRow {
  id: string;
  fullName: string;
  phone: string;
  role: "agent" | "manager";
}

export function TeamTab({ readOnly, isOwner }: { readOnly: boolean; isOwner: boolean }) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", pin: "", role: "agent" as "agent" | "manager" });
  const quota = usePlanQuota();

  const agents = members?.filter((m) => m.role === "agent") ?? [];
  const managers = members?.filter((m) => m.role === "manager") ?? [];
  const agentsQuotaReached =
    !readOnly && quota !== null && agents.length >= quota.usage.agentsQuota;
  // Le gérant ne crée pas de comptes gérant : réservé au dirigeant de la structure.
  const canCreate = !readOnly && (form.role === "agent" || isOwner);

  const load = () => {
    get<{ users: MemberRow[] }>("/api/manager/agents")
      .then((d) => setMembers(d.users))
      .catch(() => toast({ title: "Équipe indisponible", description: "Impossible de charger l'équipe." }));
  };

  useEffect(() => {
    load();
  }, []);

  useSyncDone(load);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await post("/api/manager/agents", {
        fullName: form.fullName,
        phone: form.phone,
        pin: form.pin,
        role: form.role,
      });
      if (isOfflineQueued(res)) {
        toast({
          title: "Enregistré hors ligne.",
          description: "La création partira au serveur dès le retour du réseau.",
        });
      } else {
        toast({
          title: form.role === "manager" ? "Gérant créé." : "Agent créé.",
          description:
            form.role === "manager"
              ? "Transmets-lui son numéro et son code PIN : il se connecte à l'espace gérant (back-office)."
              : "Transmets-lui son numéro et son code PIN : il se connecte sur l'application agent collecteur.",
        });
        load();
      }
      setOpen(false);
      setForm({ fullName: "", phone: "", pin: "", role: "agent" });
    } catch (err) {
      toast({ title: "Création impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setSubmitting(false);
    }
  }

  if (!members) {
    return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  }

  const quotaNotice =
    form.role === "agent" && agentsQuotaReached ? (
      <p className="rounded-md border border-[#F0D48A] bg-[#FFF4D6] px-3 py-2 text-xs font-medium text-[#A66A00]">
        Palier agents atteint : passe au palier supérieur (onglet Abonnement) pour en ajouter d&apos;autres.
      </p>
    ) : null;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm leading-relaxed text-subtle">
          {isOwner
            ? "Crée les comptes de ton équipe : gérants (back-office) et agents collecteurs (application mobile). Chacun se connecte avec son numéro et son code PIN, sur son propre espace."
            : "Crée les comptes agents de ta collecte : ils démarrent leur tournée sur l'application mobile, encaissent chez les cotisants et marquent les carnets — même hors réseau."}
        </p>
        {!readOnly && (
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {quota && (
              <p className="text-xs font-medium text-subtle" aria-live="polite">
                {agents.length} agent{agents.length > 1 ? "s" : ""} sur {quota.usage.agentsQuota} inclus
                {managers.length > 0 && ` · ${managers.length} gérant${managers.length > 1 ? "s" : ""}`}
                <span className="text-subtle"> · palier {quota.planLabel}</span>
              </p>
            )}
            {form.role === "agent" && agentsQuotaReached && !open ? (
              <p className="max-w-xs rounded-md border border-[#F0D48A] bg-[#FFF4D6] px-3 py-2 text-xs font-medium text-[#A66A00]">
                Palier agents atteint : passe au palier supérieur pour en ajouter d&apos;autres.
              </p>
            ) : (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-primary-foreground hover:bg-primary-hover">
                    <UserPlus className="h-4 w-4" aria-hidden /> Nouveau compte
                  </Button>
                </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Créer un compte équipe</DialogTitle>
                <DialogDescription>
                  {isOwner
                    ? "Gérant (back-office) ou agent collecteur (terrain) : chacun se connecte avec son numéro et ce code PIN à 6 chiffres."
                    : "L'agent se connecte avec son numéro de téléphone et ce code PIN à 6 chiffres."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                {isOwner && (
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#F4F7FB] p-1" role="radiogroup" aria-label="Type de compte">
                    {([
                      { id: "agent", label: "Agent collecteur", icon: Wallet },
                      { id: "manager", label: "Gérant", icon: UserCog },
                    ] as const).map((r) => (
                      <button
                        key={r.id}
                        role="radio"
                        aria-checked={form.role === r.id}
                        onClick={() => setForm({ ...form, role: r.id })}
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          form.role === r.id ? "bg-white text-primary shadow-sm" : "text-subtle hover:text-ink"
                        )}
                      >
                        <r.icon className="h-4 w-4" aria-hidden /> {r.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="ag-name">Nom complet</Label>
                  <Input
                    id="ag-name"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="h-11 border-line"
                    placeholder={form.role === "manager" ? "Sylvie AGBOTON" : "Cossi ADJOVI"}
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
                    À transmettre en main propre. {form.role === "manager" ? "Le gérant" : "L'agent"} pourra le changer plus tard.
                  </p>
                </div>
                {quotaNotice}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="border-line">Annuler</Button>
                <Button
                  onClick={submit}
                  disabled={
                    submitting || !canCreate ||
                    form.fullName.length < 2 || form.phone.replace(/\s+/g, "").length < 8 || form.pin.length !== 6
                  }
                  className="bg-primary text-primary-foreground hover:bg-primary-hover"
                >
                  {submitting ? "Création…" : form.role === "manager" ? "Créer le gérant" : "Créer l'agent"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
            )}
          </div>
        )}
      </div>

      {members.length === 0 ? (
        <Card className="border-dashed border-line bg-white">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EDF2F7] text-primary">
              <Users className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-display font-bold text-ink">Aucun membre pour l&apos;instant</p>
            <p className="max-w-sm text-sm text-subtle">
              Crée le premier compte {isOwner ? "gérant ou agent" : "agent"} : les agents se verront affecter
              des cotisants et démarrer leurs tournées de collecte.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((a) => (
            <Card key={a.id} className="border-line bg-white">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full font-display text-sm font-bold",
                      a.role === "manager" ? "bg-[#E8F1FD] text-primary" : "bg-[#EDF2F7] text-primary"
                    )}>
                      {a.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{a.fullName}</p>
                      <p className="amount flex items-center gap-1 text-xs text-subtle">
                        <Phone className="h-3 w-3" aria-hidden /> {a.phone}
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                    a.role === "manager"
                      ? "bg-[#E8F1FD] text-primary"
                      : "bg-[#DFF6F4] text-primary"
                  )}>
                    {a.role === "manager" ? <UserCog className="h-3 w-3" aria-hidden /> : <Wallet className="h-3 w-3" aria-hidden />}
                    {a.role === "manager" ? "Gérant" : "Agent"}
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
