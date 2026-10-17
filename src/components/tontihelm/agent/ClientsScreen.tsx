"use client";
// TontiHelm — écran Clients de l'application agent : portefeuille du terrain.
// L'agent collecteur crée ici le compte de chaque client et sa tontine (mise
// journalière, durée du cycle) — le lien personnel du carnet est généré
// immédiatement, prêt à envoyer par WhatsApp ou par e-mail.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareLinkDialog } from "../ShareLinkSheet";
import { get, isOfflineQueued, post } from "@/lib/client";
import { AgentClientRow, formatFCFA } from "@/lib/types";
import {
  BadgeCheck, CalendarDays, Link2, MapPin, Phone, Search, UserPlus, Users,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Created = {
  fullName: string;
  passbookNumber: string;
  url: string;
  phone: string;
  email: string | null;
};

const EMPTY_FORM = {
  fullName: "",
  phone: "",
  neighborhood: "",
  email: "",
  dailyAmount: "",
  cycleDays: "31",
  startsOn: new Date().toISOString().slice(0, 10),
};

export function ClientsScreen({
  structureName,
  onCreated,
}: {
  structureName: string;
  onCreated?: () => void;
}) {
  const [clients, setClients] = useState<AgentClientRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [share, setShare] = useState<{ client: AgentClientRow; url: string } | null>(null);

  const load = useCallback(() => {
    get<{ clients: AgentClientRow[] }>("/api/agent/clients")
      .then((d) => setClients(d.clients))
      .catch(() => toast({ title: "Portefeuille indisponible", description: "Impossible de charger tes clients." }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function ensureUrl(client: AgentClientRow): Promise<string> {
    if (client.shareUrl) return client.shareUrl;
    const res = await post<{ url: string }>(`/api/agent/clients/${client.id}/share`, {});
    return res.url;
  }

  async function openShare(client: AgentClientRow) {
    try {
      const url = await ensureUrl(client);
      setShare({ client, url });
    } catch (err) {
      toast({ title: "Lien indisponible", description: err instanceof Error ? err.message : "Réessaie." });
    }
  }

  async function submit() {
    const amount = parseInt(form.dailyAmount, 10) || 0;
    const cycle = parseInt(form.cycleDays, 10) || 0;
    if (form.fullName.trim().length < 2) return toast({ title: "Saisis le nom complet du client." });
    if (form.phone.replace(/[^0-9]/g, "").length < 8) return toast({ title: "Saisis le numéro de téléphone complet." });
    if (form.neighborhood.trim().length < 2) return toast({ title: "Saisis le quartier." });
    if (amount < 100) return toast({ title: "La mise journalière minimum est de 100 FCFA." });
    if (cycle < 1) return toast({ title: "Saisis la durée du cycle en jours." });

    setSubmitting(true);
    try {
      const res = await post<{ contributor: { fullName: string }; passbook: { number: string }; shareUrl: string }>(
        "/api/agent/clients",
        {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || "",
          neighborhood: form.neighborhood.trim(),
          dailyAmount: amount,
          cycleDays: cycle,
          startsOn: form.startsOn,
        }
      );
      if (isOfflineQueued(res)) {
        toast({
          title: "Enregistré hors ligne.",
          description: "Le client partira au serveur dès le retour du réseau.",
        });
        resetForm();
      } else {
        setCreated({
          fullName: res.contributor.fullName,
          passbookNumber: res.passbook.number,
          url: res.shareUrl,
          phone: form.phone.trim(),
          email: form.email.trim() || null,
        });
        resetForm();
        load();
        onCreated?.();
      }
    } catch (err) {
      toast({ title: "Création impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, startsOn: new Date().toISOString().slice(0, 10) });
  }

  const filtered = (clients ?? []).filter((c) => {
    const q = search.toLowerCase();
    return (
      c.fullName.toLowerCase().includes(q) ||
      (c.neighborhood ?? "").toLowerCase().includes(q) ||
      (c.passbook?.number ?? "").includes(q)
    );
  });

  /* ── Écran de confirmation : compte client créé + lien à partager ── */
  if (created) {
    return (
      <div className="space-y-4">
        <Card className="border-[#B5E8E5] bg-white shadow-sm">
          <CardContent className="p-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#DFF6F4]">
              <BadgeCheck className="h-7 w-7 text-success" aria-hidden />
            </span>
            <h2 className="font-display mt-3 text-lg font-bold text-ink">
              {created.fullName} est enregistré
            </h2>
            <p className="mt-1 text-sm text-subtle">
              Carnet {created.passbookNumber} créé — il est dans ta tournée dès demain (ou aujourd&apos;hui
              si la collecte n&apos;a pas commencé).
            </p>

            <div className="mt-5 rounded-xl border border-line bg-[#F4F7FB] p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Son lien de carnet</p>
              <p className="mt-1 break-all font-mono text-[12px] leading-relaxed text-ink">{created.url}</p>
              <p className="mt-2 text-xs leading-relaxed text-subtle">
                Envoie-le maintenant par WhatsApp ou par e-mail : le client y suivra chaque versement
                et l&apos;évolution de sa tontine, à tout moment.
              </p>
              <div className="mt-3 grid gap-2">
                <Button
                  className="h-11 bg-[#128C4A] text-white hover:bg-[#0F7A40]"
                  onClick={() =>
                    window.open(
                      `https://wa.me/${created.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                        `Bonjour ${created.fullName}, voici le lien de ton carnet de tontine (${structureName}) : ${created.url} — consulte ton évolution et tes versements à tout moment. Garde ce lien.`
                      )}`,
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                >
                  Envoyer par WhatsApp
                </Button>
                <Button
                  variant="outline"
                  className="h-11 border-line"
                  onClick={() => {
                    void navigator.clipboard?.writeText(created.url);
                    toast({ title: "Lien copié." });
                  }}
                >
                  Copier le lien
                </Button>
              </div>
            </div>

            <Button
              variant="outline"
              className="mt-4 border-line"
              onClick={() => setCreated(null)}
            >
              Enregistrer un autre client
            </Button>
          </CardContent>
        </Card>
        <ClientList
          clients={filtered}
          loaded={clients !== null}
          search={search}
          setSearch={setSearch}
          onShare={openShare}
        />
        <ShareLinkDialog
          open={share !== null}
          onOpenChange={(v) => !v && setShare(null)}
          url={share?.url ?? ""}
          contributorName={share?.client.fullName ?? ""}
          structureName={structureName}
          phone={share?.client.phone ?? null}
          email={share?.client.email ?? null}
          passbookNumber={share?.client.passbook?.number ?? null}
        />
      </div>
    );
  }

  /* ── Écran principal : formulaire de création + portefeuille ── */
  return (
    <div className="space-y-4">
      <Card className="border-line bg-white shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E8F1FD] text-primary">
              <UserPlus className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="font-display text-sm font-bold text-ink">Nouveau client</p>
              <p className="text-xs text-subtle">Sur le terrain : identité, téléphone, tontine.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3.5">
            <div>
              <Label htmlFor="cl-name">Nom complet *</Label>
              <Input
                id="cl-name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="mt-1.5 h-11 border-line"
                placeholder="Ahouansou Miriam"
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cl-phone">Téléphone (WhatsApp) *</Label>
                <Input
                  id="cl-phone"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="mt-1.5 h-11 border-line"
                  placeholder="+229 97 01 02 03"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="cl-area">Quartier *</Label>
                <Input
                  id="cl-area"
                  value={form.neighborhood}
                  onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                  className="mt-1.5 h-11 border-line"
                  placeholder="Albarika"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="cl-amount">Mise / jour *</Label>
                <Input
                  id="cl-amount"
                  inputMode="numeric"
                  value={form.dailyAmount}
                  onChange={(e) => setForm({ ...form, dailyAmount: e.target.value.replace(/\D/g, "") })}
                  className="amount mt-1.5 h-11 border-line"
                  placeholder="500"
                />
              </div>
              <div>
                <Label htmlFor="cl-cycle">Cycle (jours) *</Label>
                <Input
                  id="cl-cycle"
                  inputMode="numeric"
                  value={form.cycleDays}
                  onChange={(e) => setForm({ ...form, cycleDays: e.target.value.replace(/\D/g, "") })}
                  className="amount mt-1.5 h-11 border-line"
                  placeholder="31"
                />
              </div>
              <div>
                <Label htmlFor="cl-start">Début *</Label>
                <Input
                  id="cl-start"
                  type="date"
                  value={form.startsOn}
                  onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
                  className="mt-1.5 h-11 border-line"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="cl-email">E-mail (facultatif)</Label>
              <Input
                id="cl-email"
                type="email"
                inputMode="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1.5 h-11 border-line"
                placeholder="client@exemple.bj"
                autoComplete="off"
              />
              <p className="mt-1.5 text-xs leading-relaxed text-subtle">
                Le lien du carnet sera envoyé par WhatsApp ; l&apos;e-mail permet aussi un envoi par
                courriel.
              </p>
            </div>

            <Button
              onClick={submit}
              disabled={submitting}
              className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover"
            >
              {submitting ? "Création…" : "Créer le client et son carnet"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ClientList
        clients={filtered}
        loaded={clients !== null}
        search={search}
        setSearch={setSearch}
        onShare={openShare}
      />

      <ShareLinkDialog
        open={share !== null}
        onOpenChange={(v) => !v && setShare(null)}
        url={share?.url ?? ""}
        contributorName={share?.client.fullName ?? ""}
        structureName={structureName}
        phone={share?.client.phone ?? null}
        email={share?.client.email ?? null}
        passbookNumber={share?.client.passbook?.number ?? null}
      />
    </div>
  );
}

function ClientList({
  clients,
  loaded,
  search,
  setSearch,
  onShare,
}: {
  clients: AgentClientRow[];
  loaded: boolean;
  search: string;
  setSearch: (v: string) => void;
  onShare: (c: AgentClientRow) => void;
}) {
  if (!loaded) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>;
  }
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="font-display text-sm font-bold text-ink">
          Mes clients <span className="font-normal text-subtle">({clients.length})</span>
        </p>
        <div className="relative w-40">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher"
            className="h-10 border-line pl-9 text-sm"
            aria-label="Rechercher un client"
          />
        </div>
      </div>

      {clients.length === 0 ? (
        <Card className="border-dashed border-line bg-white">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EDF2F7] text-primary">
              <Users className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-display font-bold text-ink">Aucun client pour l&apos;instant</p>
            <p className="max-w-xs text-sm text-subtle">
              Crée le compte de ton premier client ci-dessus : son carnet démarre immédiatement et il
              reçoit son lien de suivi.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {clients.map((c) => (
            <Card key={c.id} className="border-line bg-white">
              <CardContent className="flex items-center gap-3 p-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E8F1FD] font-display text-sm font-bold text-primary">
                  {c.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{c.fullName}</p>
                  <p className="amount flex flex-wrap items-center gap-x-3 text-xs text-subtle">
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" aria-hidden /> {c.phone ?? "—"}</span>
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden /> {c.neighborhood ?? "—"}</span>
                  </p>
                  {c.passbook && (
                    <p className="amount mt-1 text-xs text-subtle">
                      Carnet {c.passbook.number} · {c.passbook.paidDays}/{c.passbook.cycleDays} j ·{" "}
                      <span className="font-semibold text-ink">{formatFCFA(c.passbook.balance)}</span>
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 border-[#9ED9D3] bg-[#F0FBFA] text-primary hover:bg-[#DFF6F4] hover:text-primary"
                  onClick={() => onShare(c)}
                  aria-label={`Lien du carnet de ${c.fullName}`}
                >
                  <Link2 className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Lien</span>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-subtle">
        <CalendarDays className="h-3 w-3" aria-hidden />
        Chaque client suit sa tontine depuis son lien — aucun reçu SMS n&apos;est envoyé.
      </p>
    </div>
  );
}
