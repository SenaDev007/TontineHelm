"use client";
// TontiHelm — écran Clients de l'application agent : portefeuille du terrain.
// L'agent crée le compte du client + son premier livret (la mise journalière
// suffit : le livret annuel démarre AUTOMATIQUEMENT au mois en cours) et peut
// ajouter d'autres carnets au même client (surnom : « boutique », « école »…).
// Tous les carnets sont regroupés sous le client : on clique le client, puis le
// carnet à encaisser. Le lien personnel (rattaché à l'entité) part par WhatsApp.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareLinkDialog } from "../ShareLinkSheet";
import { get, isOfflineQueued, post } from "@/lib/client";
import { AgentCarnetRow, AgentClientRow, formatFCFA } from "@/lib/types";
import { LivretSheets } from "../carnet/LivretSheets";
import {
  BadgeCheck, BookOpen, CalendarDays, ChevronDown, ChevronUp, Link2, MapPin,
  Phone, Plus, Search, UserPlus, Users, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Created = {
  fullName: string;
  passbookNumber: string;
  label: string | null;
  url: string;
  phone: string;
  email: string | null;
};

const EMPTY_FORM = {
  fullName: "",
  phone: "",
  neighborhood: "",
  email: "",
  idNumber: "",
  dailyAmount: "",
  label: "",
};

const EMPTY_NEW_CARNET = { dailyAmount: "", label: "" };

export function ClientsScreen({
  structureName,
  onCreated,
  onOpenCarnet,
}: {
  structureName: string;
  onCreated?: () => void;
  onOpenCarnet?: (client: AgentClientRow, carnet: AgentCarnetRow) => void;
}) {
  const [clients, setClients] = useState<AgentClientRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [share, setShare] = useState<{ client: AgentClientRow; url: string } | null>(null);
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const [openCarnet, setOpenCarnet] = useState<{ clientId: string; carnet: AgentCarnetRow } | null>(null);
  const [newCarnetFor, setNewCarnetFor] = useState<AgentClientRow | null>(null);
  const [newCarnetForm, setNewCarnetForm] = useState(EMPTY_NEW_CARNET);
  const [addingCarnet, setAddingCarnet] = useState(false);

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
    if (form.fullName.trim().length < 2) return toast({ title: "Saisis le nom complet du client." });
    if (form.phone.replace(/[^0-9]/g, "").length < 8) return toast({ title: "Saisis le numéro de téléphone complet." });
    if (form.neighborhood.trim().length < 2) return toast({ title: "Saisis le quartier." });
    if (amount < 100) return toast({ title: "La mise journalière minimum est de 100 FCFA." });

    setSubmitting(true);
    try {
      const res = await post<{ contributor: { fullName: string }; passbook: { number: string; label: string | null }; shareUrl: string; autoUpgrade?: { from: string | null; to: string } | null }>(
        "/api/agent/clients",
        {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || "",
          neighborhood: form.neighborhood.trim(),
          idNumber: form.idNumber.trim() || "",
          dailyAmount: amount,
          label: form.label.trim() || "",
        }
      );
      if (isOfflineQueued(res)) {
        toast({
          title: "Enregistré hors ligne.",
          description: "Le client partira au serveur dès le retour du réseau.",
        });
        resetForm();
      } else {
        if (res.autoUpgrade) {
          toast({
            title: "Palier supérieur activé automatiquement.",
            description: `Ton activité a grandi : l'abonnement est passé au palier supérieur (${res.autoUpgrade.to}). Tes dirigeants ont été alertés.`,
          });
        }
        setCreated({
          fullName: res.contributor.fullName,
          passbookNumber: res.passbook.number,
          label: res.passbook.label,
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

  async function submitNewCarnet() {
    if (!newCarnetFor) return;
    const amount = parseInt(newCarnetForm.dailyAmount, 10) || 0;
    if (amount < 100) return toast({ title: "La mise journalière minimum est de 100 FCFA." });
    setAddingCarnet(true);
    try {
      const res = await post<{ passbook: { number: string; label: string | null } }>(
        `/api/agent/clients/${newCarnetFor.id}/carnets`,
        { dailyAmount: amount, label: newCarnetForm.label.trim() || "" }
      );
      if (isOfflineQueued(res)) {
        toast({ title: "Enregistré hors ligne.", description: "Le carnet partira au serveur dès le retour du réseau." });
      } else {
        toast({
          title: `Carnet ${res.passbook.number} ajouté.`,
          description: `${newCarnetFor.fullName} peut maintenant cotiser sur ce nouveau livret${res.passbook.label ? ` « ${res.passbook.label} »` : ""}.`,
        });
      }
      setNewCarnetFor(null);
      setNewCarnetForm(EMPTY_NEW_CARNET);
      load();
      onCreated?.();
    } catch (err) {
      toast({ title: "Ajout impossible", description: err instanceof Error ? err.message : "Réessaie." });
    } finally {
      setAddingCarnet(false);
    }
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM });
  }

  const filtered = (clients ?? []).filter((c) => {
    const q = search.toLowerCase();
    return (
      c.fullName.toLowerCase().includes(q) ||
      (c.neighborhood ?? "").toLowerCase().includes(q) ||
      c.carnets.some((k) => k.number.includes(q) || (k.label ?? "").toLowerCase().includes(q))
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
              Livret annuel {created.passbookNumber}{created.label ? ` « ${created.label} »` : ""} créé : 12 feuilles
              mensuelles qui démarrent ce mois-ci — il est dans ta tournée dès aujourd&apos;hui.
            </p>

            <div className="mt-5 rounded-xl border border-line bg-[#F4F7FB] p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Son lien de carnet (rattaché à ta structure)</p>
              <p className="mt-1 break-all font-mono text-[12px] leading-relaxed text-ink">{created.url}</p>
              <p className="mt-2 text-xs leading-relaxed text-subtle">
                Envoie-le maintenant par WhatsApp ou par e-mail : le client y suivra chaque versement et
                l&apos;évolution de sa tontine, à tout moment.
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
          openClientId={openClientId}
          setOpenClientId={setOpenClientId}
          openCarnet={openCarnet}
          setOpenCarnet={setOpenCarnet}
          onOpenCarnet={onOpenCarnet}
          onAddCarnet={(c) => { setNewCarnetFor(c); setNewCarnetForm(EMPTY_NEW_CARNET); }}
        />
        <ShareLinkDialog
          open={share !== null}
          onOpenChange={(v) => !v && setShare(null)}
          url={share?.url ?? ""}
          contributorName={share?.client.fullName ?? ""}
          structureName={structureName}
          phone={share?.client.phone ?? null}
          email={share?.client.email ?? null}
          passbookNumber={share?.client.carnets[0]?.number ?? null}
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
              <p className="text-xs text-subtle">Sur le terrain : identité, téléphone et mise journalière.</p>
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
            <div className="grid grid-cols-2 gap-3">
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
                <Label htmlFor="cl-label">Surnom du carnet</Label>
                <Input
                  id="cl-label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="mt-1.5 h-11 border-line"
                  placeholder="Boutique, école…"
                  autoComplete="off"
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
                Livret annuel : 12 feuilles mensuelles démarrant <b>automatiquement au mois en cours</b>,
                la 31e mise de chaque feuille revenant à l&apos;entreprise. Le lien du carnet part par
                WhatsApp ; l&apos;e-mail permet aussi un envoi par courriel.
              </p>
            </div>

            <Button
              onClick={submit}
              disabled={submitting}
              className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover"
            >
              {submitting ? "Création…" : "Créer le client et son livret annuel"}
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
        openClientId={openClientId}
        setOpenClientId={setOpenClientId}
        openCarnet={openCarnet}
        setOpenCarnet={setOpenCarnet}
        onOpenCarnet={onOpenCarnet}
        onAddCarnet={(c) => { setNewCarnetFor(c); setNewCarnetForm(EMPTY_NEW_CARNET); }}
      />

      {/* Ajout d'un carnet supplémentaire pour un client existant */}
      {newCarnetFor && (
        <Card className="border-primary/40 bg-white shadow-sm">
          <CardContent className="p-4">
            <p className="font-display text-sm font-bold text-ink">
              Nouveau carnet pour {newCarnetFor.fullName}
            </p>
            <p className="mt-0.5 text-xs text-subtle">
              Le client peut prendre plusieurs carnets — chacun avec sa mise et son surnom, tous regroupés
              sous son nom.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="nc-amount">Mise / jour *</Label>
                <Input
                  id="nc-amount"
                  inputMode="numeric"
                  value={newCarnetForm.dailyAmount}
                  onChange={(e) => setNewCarnetForm({ ...newCarnetForm, dailyAmount: e.target.value.replace(/\D/g, "") })}
                  className="amount mt-1.5 h-11 border-line"
                  placeholder="500"
                />
              </div>
              <div>
                <Label htmlFor="nc-label">Surnom du carnet</Label>
                <Input
                  id="nc-label"
                  value={newCarnetForm.label}
                  onChange={(e) => setNewCarnetForm({ ...newCarnetForm, label: e.target.value })}
                  className="mt-1.5 h-11 border-line"
                  placeholder="Épargne maison…"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                onClick={submitNewCarnet}
                disabled={addingCarnet}
                className="h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary-hover"
              >
                {addingCarnet ? "Ajout…" : "Ajouter le carnet"}
              </Button>
              <Button variant="outline" className="h-11 border-line" onClick={() => setNewCarnetFor(null)}>
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ShareLinkDialog
        open={share !== null}
        onOpenChange={(v) => !v && setShare(null)}
        url={share?.url ?? ""}
        contributorName={share?.client.fullName ?? ""}
        structureName={structureName}
        phone={share?.client.phone ?? null}
        email={share?.client.email ?? null}
        passbookNumber={share?.client.carnets[0]?.number ?? null}
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
  openClientId,
  setOpenClientId,
  openCarnet,
  setOpenCarnet,
  onOpenCarnet,
  onAddCarnet,
}: {
  clients: AgentClientRow[];
  loaded: boolean;
  search: string;
  setSearch: (v: string) => void;
  onShare: (c: AgentClientRow) => void;
  openClientId: string | null;
  setOpenClientId: (v: string | null) => void;
  openCarnet: { clientId: string; carnet: AgentCarnetRow } | null;
  setOpenCarnet: (v: { clientId: string; carnet: AgentCarnetRow } | null) => void;
  onOpenCarnet?: (client: AgentClientRow, carnet: AgentCarnetRow) => void;
  onAddCarnet: (c: AgentClientRow) => void;
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
              Crée le compte de ton premier client ci-dessus : son livret annuel démarre ce mois-ci et il
              reçoit son lien de suivi.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {clients.map((c) => {
            const expanded = openClientId === c.id;
            return (
              <Card key={c.id} className={cn("border-line bg-white", expanded && "border-primary/40")}>
                <CardContent className="p-3.5">
                  {/* Ligne client : identité + résumé carnets */}
                  <button
                    className="flex w-full items-center gap-3 text-left"
                    onClick={() => { setOpenClientId(expanded ? null : c.id); setOpenCarnet(null); }}
                    aria-expanded={expanded}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E8F1FD] font-display text-sm font-bold text-primary">
                      {c.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{c.fullName}</p>
                      <p className="amount flex flex-wrap items-center gap-x-3 text-xs text-subtle">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" aria-hidden /> {c.phone ?? "—"}</span>
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden /> {c.neighborhood ?? "—"}</span>
                      </p>
                      <p className="amount mt-1 text-xs text-subtle">
                        {c.carnets.length} carnet{c.carnets.length > 1 ? "s" : ""}
                        {c.carnets.length > 0 && (
                          <> · {formatFCFA(c.carnets.reduce((s, k) => s + k.balance, 0))} cumulés</>
                        )}
                      </p>
                    </div>
                    {expanded ? (
                      <ChevronUp className="h-5 w-5 shrink-0 text-subtle" aria-hidden />
                    ) : (
                      <ChevronDown className="h-5 w-5 shrink-0 text-subtle" aria-hidden />
                    )}
                  </button>

                  {/* Détail : les carnets du client, regroupés sous son nom */}
                  {expanded && (
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      {c.carnets.length === 0 && (
                        <p className="rounded-lg bg-[#F4F7FB] p-3 text-xs text-subtle">
                          Aucun carnet actif — ajoute-en un ci-dessous.
                        </p>
                      )}
                      {c.carnets.map((k) => {
                        const carnetOpen = openCarnet?.carnet.id === k.id;
                        return (
                          <div key={k.id} className="rounded-lg border border-line bg-[#F9FBFD]">
                            <button
                              className="flex w-full items-center gap-3 p-2.5 text-left"
                              onClick={() => setOpenCarnet(carnetOpen ? null : { clientId: c.id, carnet: k })}
                              aria-expanded={carnetOpen}
                            >
                              <span className="amount flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EDF2F7] text-xs font-bold text-ink" aria-hidden>
                                {k.number}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-semibold text-ink">
                                  Carnet {k.number}{k.label ? <span className="font-normal text-subtle"> · {k.label}</span> : null}
                                </p>
                                <p className="amount text-[11px] text-subtle">
                                  F{k.livret.currentSheet}/12 · {k.livret.coveredLines}/372 lignes ·{" "}
                                  <span className={cn("font-semibold", k.livret.missedLines > 0 ? "text-danger" : "text-ink")}>
                                    {formatFCFA(k.balance)}
                                  </span>
                                </p>
                              </div>
                              <span className={cn(
                                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                k.status === "late" ? "border-[#F5C6C0] bg-[#FDECEA] text-[#B3261E]"
                                  : k.status === "active" ? "border-[#B5E8E5] bg-[#DFF6F4] text-[#00806B]"
                                    : "border-line bg-[#EDF2F7] text-subtle"
                              )}>
                                {k.statusLabel}
                              </span>
                            </button>

                            {/* Feuilles du carnet + encaissement direct */}
                            {carnetOpen && (
                              <div className="space-y-3 border-t border-line p-3">
                                <LivretSheets livret={k.livret} compact />
                                {k.status !== "completed" && k.status !== "closing" && onOpenCarnet && (
                                  <Button
                                    className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary-hover"
                                    onClick={() => onOpenCarnet(c, k)}
                                  >
                                    <Wallet className="h-4 w-4" aria-hidden /> Encaisser sur ce carnet
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 flex-1 border-line"
                          onClick={() => onAddCarnet(c)}
                        >
                          <Plus className="h-4 w-4" aria-hidden /> Nouveau carnet
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 flex-1 border-[#9ED9D3] bg-[#F0FBFA] text-primary hover:bg-[#DFF6F4] hover:text-primary"
                          onClick={() => onShare(c)}
                        >
                          <Link2 className="h-4 w-4" aria-hidden /> Lien du carnet
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-subtle">
        <CalendarDays className="h-3 w-3" aria-hidden />
        Chaque client suit ses carnets depuis son lien — aucun reçu SMS n&apos;est envoyé.
      </p>
    </div>
  );
}
