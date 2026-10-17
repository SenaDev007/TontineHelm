"use client";
// TontiHelm — inscription de la structure avec souscription payante (patron
// Academia Helm) : identité de la structure, puis dirigeant et code PIN, puis
// ÉTAPE 3 = choix du plan d'abonnement et PAIEMENT FedaPay. Le compte est créé
// et ACTIF dès la confirmation du paiement — plus de « demande d'ouverture ».
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogoMark } from "../Logo";
import { post, setToken, ApiClientError } from "@/lib/client";
import { FedaPayCheckout, type FedaPayCheckoutData } from "./FedaPayCheckout";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, CreditCard, ExternalLink,
  Loader2, PartyPopper, ShieldCheck, Smartphone, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "sfd", label: "SFD — microfinance décentralisée (arrêté du ministre)" },
  { value: "groupement", label: "Groupement d'épargne (récépissé ou statut)" },
  { value: "pme", label: "PME collectrice (registre de commerce)" },
];

const PLANS = [
  {
    key: "demarrage", name: "Démarrage", monthly: 15000,
    range: "1 agent · 50 cotisants",
    features: ["Application agent hors ligne", "Clôture de caisse et audit", "Export Excel et PDF"],
    highlight: false,
  },
  {
    key: "pro", name: "Pro", monthly: 35000,
    range: "2 à 10 agents · 51 à 300 cotisants",
    features: ["Rappels automatiques en retard", "Support WhatsApp sous 24 h", "Tout le palier Démarrage"],
    highlight: true,
  },
  {
    key: "institution", name: "Institution", monthly: 75000,
    range: "11 à 40 agents · 301 à 3 000 cotisants",
    features: ["Rapports réglementaires", "Multi-agences", "Support dédié sous 4 h"],
    highlight: false,
  },
] as const;

type PlanKey = (typeof PLANS)[number]["key"];

const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/\u202f/g, " ")} FCFA`;

/** Libellé du plan par clé (l'accusé d'activation ne porte que la clé). */
const planName = (key?: string | null) =>
  PLANS.find((p) => p.key === key)?.name ?? "souscrit";

interface RegisterResponse {
  ok: boolean; paymentId: string; amount: number;
  plan: PlanKey; billingPeriod: "monthly" | "yearly"; mode: "fedapay" | "test" | "unconfigured";
}

interface PaymentSession {
  ok: boolean; mode: "fedapay" | "test"; paymentId: string; amount: number;
  transactionId?: string | null; paymentUrl?: string | null;
  checkout?: FedaPayCheckoutData;
}

interface VerifyResponse {
  status: "approved" | "declined" | "pending";
  activated: boolean;
  token?: string | null;
  structureName?: string;
  ownerPhone?: string;
  plan?: string;
  message?: string;
}

export function RegisterScreen({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Étape 3 — abonnement et paiement.
  const [plan, setPlan] = useState<PlanKey | "">("");
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [checkoutData, setCheckoutData] = useState<FedaPayCheckoutData | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyStalled, setVerifyStalled] = useState(false); // vérification lente : bouton manuel
  const [redirecting, setRedirecting] = useState(false); // vers la page hébergée FedaPay
  const [activation, setActivation] = useState<VerifyResponse | null>(null); // accusé (structureName… après redirection)
  const [finished, setFinished] = useState(false);
  const verifyAttemptsRef = useRef(0); // bornage anti-boucle (bug historique « vérification en boucle »)

  const [form, setForm] = useState({
    structureName: "", kind: "", licenseRef: "",
    city: "", ownerName: "", ownerPhone: "", pin: "", pinConfirm: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const chosenPlan = PLANS.find((p) => p.key === plan);
  const amount = useMemo(() => {
    if (!chosenPlan) return 0;
    return period === "yearly" ? chosenPlan.monthly * 10 : chosenPlan.monthly;
  }, [chosenPlan, period]);

  function next() {
    setError(null);
    if (step === 1) {
      if (form.structureName.trim().length < 2) return setError("Saisis le nom de ta structure.");
      if (!form.kind) return setError("Choisis le type de ta structure.");
      if (form.city.trim().length < 2) return setError("Saisis ta ville.");
    }
    if (step === 2) {
      if (form.ownerName.trim().length < 2) return setError("Saisis ton nom complet.");
      if (form.ownerPhone.replace(/\s+/g, "").length < 8) return setError("Numéro invalide. Saisis ton numéro complet, sans espace.");
      if (!/^\d{6}$/.test(form.pin)) return setError("Le code PIN doit contenir 6 chiffres.");
      if (form.pin !== form.pinConfirm) return setError("Les deux codes PIN ne correspondent pas.");
    }
    if (step === 3 && !plan) {
      return setError("Choisis ton plan d'abonnement pour continuer.");
    }
    setStep((s) => Math.min(3, s + 1));
  }

  // ── Lancement du paiement : draft → session FedaPay / mode test ────────────
  // Patron Academia Helm : PRIMAIRE = redirection pleine page vers la page de
  // paiement HÉBERGÉE FedaPay (liée à la transaction créée côté serveur avec la
  // clé secrète). Le widget intégré n'est qu'un repli sans cette URL.
  async function startPayment() {
    if (!plan || !chosenPlan) {
      setError("Choisis ton plan d'abonnement pour payer.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // 1. Enregistrement du formulaire + intention de paiement (montant fixé serveur).
      const reg = await post<RegisterResponse>("/api/structures/register", {
        structureName: form.structureName.trim(),
        kind: form.kind,
        licenseRef: form.licenseRef.trim() || undefined,
        city: form.city.trim(),
        ownerName: form.ownerName.trim(),
        ownerPhone: form.ownerPhone.replace(/\s+/g, ""),
        pin: form.pin,
        plan,
        billingPeriod: period,
      });
      // 2. Session de paiement : transaction FedaPay + lien hébergé, ou mode test.
      const pay = await post<PaymentSession>("/api/structures/register/payment", {
        paymentId: reg.paymentId,
      });
      verifyAttemptsRef.current = 0;
      setVerifyStalled(false);
      setSession(pay);
      if (pay.mode === "fedapay" && pay.paymentUrl) {
        // PRIMAIRE (Academia Helm) : page pleine page FedaPay. Au retour, FedaPay
        // ramène sur /inscription?paymentId=…&status=return → vérification serveur.
        setRedirecting(true);
        window.location.href = pay.paymentUrl;
        return;
      }
      // Repli : widget intégré (amount + description, sans identifiant).
      if (pay.mode === "fedapay" && pay.checkout) setCheckoutData(pay.checkout);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de préparer le paiement. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  // ── Vérification du statut réel (backend ↔ FedaPay) puis activation ───────
  // ⚠ Bug historique corrigé : la vérification est BORNÉE (10 tentatives, ~35 s)
  // — plus jamais de boucle infinie « Vérification… » qui réaffiche le modal.
  // `fedapayTransactionId` : identifiant DE TRANSACTION rapporté par le widget
  // intégré (repli) — simple clé de recherche, le statut vient toujours de l'API.
  const MAX_VERIFY_ATTEMPTS = 10;
  const verify = useCallback(
    async (outcome?: "approved" | "declined", fedapayTransactionId?: string) => {
      if (!session) return;
      setVerifying(true);
      setVerifyStalled(false);
      setError(null);
      const attempt = ++verifyAttemptsRef.current;
      try {
        const res = await post<VerifyResponse>("/api/structures/register/verify", {
          paymentId: session.paymentId,
          ...(outcome ? { outcome } : {}),
          ...(fedapayTransactionId ? { fedapayTransactionId } : {}),
        });
        if (res.activated) {
          if (res.token) setToken(res.token);
          setActivation(res);
          setFinished(true);
          setVerifying(false);
          return;
        }
        if (res.status === "pending") {
          if (attempt >= MAX_VERIFY_ATTEMPTS) {
            // Toujours en attente : on rend la main à l'utilisateur avec un
            // bouton de relance manuelle (plus de boucle invisible).
            setVerifyStalled(true);
            setVerifying(false);
            return;
          }
          setTimeout(
            () => void verify(undefined, fedapayTransactionId),
            attempt < 3 ? 2500 : 4000,
          );
          return; // « verifying » reste true : pas de flash du modal entre deux sondes
        }
        // Refusé/annulé : verdict définitif.
        setError(res.message ?? "Le paiement n'a pas été confirmé. Réessaie.");
        setSession(null);
        setCheckoutData(null);
        setVerifying(false);
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "payment_check_retry") {
          if (attempt >= MAX_VERIFY_ATTEMPTS) {
            setVerifyStalled(true);
            setVerifying(false);
            return;
          }
          setTimeout(() => void verify(undefined, fedapayTransactionId), 4000);
          return;
        }
        // transaction_not_found / définitif : erreur claire + reprise possible.
        setError(err instanceof Error ? err.message : "Vérification du paiement impossible.");
        setSession(null);
        setCheckoutData(null);
        setVerifying(false);
      }
    },
    [session],
  );

  /** Relance manuelle après blocage : remet le compteur à zéro. */
  const recheck = useCallback(() => {
    verifyAttemptsRef.current = 0;
    void verify();
  }, [verify]);

  // Retour pleine page FedaPay : /inscription?paymentId=…&status=return → vérifier.
  // On saute à l'étape 3 (zone de paiement) : le formulaire est vide après le
  // rechargement, c'est l'accusé d'activation qui portera les libellés de succès.
  const [returnedFromFedapay, setReturnedFromFedapay] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("paymentId");
    if (paymentId && params.get("status") === "return") {
      setStep(3);
      setSession((s) => s ?? { ok: true, mode: "fedapay", paymentId, amount: 0 });
      setReturnedFromFedapay(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le sondage démarre UNIQUEMENT au retour de la page hébergée (le repli widget
  // lance sa propre vérification sur onComplete — inutile de sonder avant qu'il
  // ait payé).
  useEffect(() => {
    if (returnedFromFedapay && session) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedFromFedapay, session?.paymentId]);

  // Achèvement du widget intégré (repli) : le message porte la transaction que
  // l'iframe a créée — on n'en garde que l'IDENTIFIANT (jamais le statut annoncé).
  const handleCheckoutComplete = useCallback(
    (payload: unknown) => {
      const tx = (payload as { transaction?: { id?: string | number } } | null)?.transaction;
      const txId = tx?.id !== undefined && tx?.id !== null ? String(tx.id) : undefined;
      void verify(undefined, txId);
    },
    [verify],
  );
  const handleCheckoutError = useCallback(() => {
    setError("Le paiement n'a pas abouti. Choisis un autre moyen ou réessaie.");
  }, []);

  const stepLabels = ["Ma structure", "Mon compte", "Abonnement"];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-4 md:px-6 lg:px-8">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-subtle transition-colors hover:text-ink">
            <ArrowLeft className="h-4 w-4 tontihelm-icon" aria-hidden /> Retour au site
          </button>
          <LogoMark size={40} priority />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1200px] flex-1 items-start justify-center px-4 py-10 md:px-6 lg:py-14 lg:px-8">
        {finished ? (
          <Card className="w-full max-w-lg border-line text-center">
            <CardContent className="p-8">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#DFF6F4] text-success">
                <PartyPopper className="h-7 w-7 tontihelm-icon" aria-hidden />
              </span>
              <h1 className="font-display mt-5 text-2xl font-bold text-ink">Compte créé avec succès</h1>
              <p className="mt-3 text-base leading-relaxed text-subtle">
                Paiement confirmé. <strong className="text-ink">{activation?.structureName || form.structureName}</strong> est active,
                ton abonnement {planName(activation?.plan ?? plan)} court dès aujourd&apos;hui. Ton numéro
                <strong className="text-ink"> {activation?.ownerPhone || form.ownerPhone}</strong> est ton identifiant de connexion.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  onClick={() => router.push("/")}
                  className="h-12 bg-primary px-6 text-primary-foreground hover:bg-primary-hover"
                >
                  Ouvrir mon espace
                </Button>
                <Button variant="outline" asChild className="h-12 border-line px-6">
                  <a href="/">Retour au site</a>
                </Button>
              </div>
              <p className="mt-5 text-xs text-subtle">
                Le reçu du paiement et le détail de l&apos;abonnement sont disponibles dans l&apos;onglet
                Facturation de ton espace.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full max-w-xl animate-scale-in border-line">
            <CardHeader>
              <div className="mb-1 flex justify-center">
                <LogoMark size={64} priority />
              </div>
              <CardTitle className="font-display text-xl font-bold">Créer mon compte</CardTitle>
              <p className="text-sm text-subtle">
                Trois étapes, puis ton espace est actif immédiatement après le paiement.
                Aucune pièce à joindre : l&apos;agrément se vérifie avec un conseiller après le démarrage.
              </p>
              {/* Stepper */}
              <div className="mt-4 flex items-center gap-2" aria-hidden>
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex flex-1 items-center gap-2">
                    <span className={cn(
                      "font-display flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                      s <= step ? "bg-primary text-primary-foreground" : "bg-[#EDF2F7] text-subtle"
                    )}>
                      {s < step ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : s}
                    </span>
                    <span className={cn("hidden text-xs font-medium sm:block", s <= step ? "text-ink" : "text-subtle")}>
                      {stepLabels[s - 1]}
                    </span>
                    {s < 3 && <span className={cn("h-px flex-1", s < step ? "bg-primary" : "bg-line")} />}
                  </div>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {step === 1 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="sname">Nom de la structure</Label>
                    <Input id="sname" value={form.structureName} onChange={(e) => set("structureName", e.target.value)} className="h-12 border-line text-base" placeholder="Alafia Finance" />
                  </div>
                  <div className="space-y-2">
                    <Label>Type de structure</Label>
                    <Select value={form.kind} onValueChange={(v) => set("kind", v)}>
                      <SelectTrigger className="h-12 border-line text-base" aria-label="Type de structure">
                        <SelectValue placeholder="Choisis le type" />
                      </SelectTrigger>
                      <SelectContent>
                        {KINDS.map((k) => (
                          <SelectItem key={k.value} value={k.value} className="text-base">{k.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lref">
                      Numéro d&apos;agrément, de récépissé ou de RC{" "}
                      <span className="font-normal text-subtle">(facultatif)</span>
                    </Label>
                    <Input
                      id="lref"
                      value={form.licenseRef}
                      onChange={(e) => set("licenseRef", e.target.value)}
                      className="h-12 border-line text-base"
                      placeholder="Arrêté MEF/DC/SG/SFD n° 2021-087 — tu peux l'ajouter plus tard"
                    />
                    <p className="text-xs text-subtle">
                      La loi exige l&apos;agrément pour collecter l&apos;épargne : nous le vérifions avec toi
                      après l&apos;activation, aucune pièce à joindre maintenant.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Ville</Label>
                    <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} className="h-12 border-line text-base" placeholder="Parakou" />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="oname">Nom complet du dirigeant</Label>
                    <Input id="oname" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} className="h-12 border-line text-base" placeholder="Kossi Adjovi" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ophone">Numéro de téléphone du dirigeant</Label>
                    <Input id="ophone" inputMode="tel" value={form.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} className="h-12 border-line text-base" placeholder="+229 97 00 00 00" />
                    <p className="text-xs text-subtle">Ce numéro est ton identifiant de connexion à l&apos;espace dirigeant.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pin1">Code PIN (6 chiffres)</Label>
                      <Input id="pin1" inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} className="amount h-12 border-line text-base" placeholder="••••••" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pin2">Confirme le code PIN</Label>
                      <Input id="pin2" inputMode="numeric" maxLength={6} value={form.pinConfirm} onChange={(e) => set("pinConfirm", e.target.value.replace(/\D/g, ""))} className="amount h-12 border-line text-base" placeholder="••••••" />
                    </div>
                  </div>
                </>
              )}

              {step === 3 && !session && (
                <div className="space-y-5">
                  {/* Période de facturation */}
                  <div>
                    <Label>Période de facturation</Label>
                    <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Période de facturation">
                      {([
                        { key: "monthly", label: "Mensuel", hint: "sans engagement" },
                        { key: "yearly", label: "Annuel", hint: "2 mois inclus" },
                      ] as const).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          role="radio"
                          aria-checked={period === opt.key}
                          onClick={() => setPeriod(opt.key)}
                          className={cn(
                            "rounded-lg border-2 p-3 text-left transition-colors",
                            period === opt.key ? "border-primary bg-white" : "border-line bg-white hover:border-primary/40",
                          )}
                        >
                          <span className="block text-sm font-semibold text-ink">{opt.label}</span>
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-subtle">
                            {opt.key === "yearly" && <Sparkles className="h-3 w-3 text-accent" aria-hidden />}
                            {opt.hint}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cartes de plans */}
                  <div>
                    <Label>Choisis ton plan d&apos;abonnement</Label>
                    <div className="mt-2 grid gap-3">
                      {PLANS.map((p) => {
                        const selected = plan === p.key;
                        const price = period === "yearly" ? p.monthly * 10 : p.monthly;
                        return (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => { setPlan(p.key); setError(null); }}
                            aria-pressed={selected}
                            className={cn(
                              "relative rounded-xl border-2 p-4 text-left transition-all",
                              selected ? "border-primary bg-white shadow-md" : "border-line bg-white hover:border-primary/40",
                            )}
                          >
                            {p.highlight && (
                              <Badge className="absolute -top-2.5 right-4 bg-primary text-primary-foreground">
                                Le plus choisi
                              </Badge>
                            )}
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-display text-base font-bold text-ink">{p.name}</span>
                                  {selected && (
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                                      <Check className="h-3 w-3 text-primary-foreground" aria-hidden />
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-xs font-medium text-primary">{p.range}</p>
                                <ul className="mt-2 space-y-1">
                                  {p.features.map((f) => (
                                    <li key={f} className="flex items-start gap-1.5 text-xs text-subtle">
                                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
                                      {f}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="amount text-lg font-bold text-ink">{fcfa(price)}</p>
                                <p className="text-xs text-subtle">{period === "yearly" ? "par an" : "par mois"}</p>
                                {period === "yearly" && (
                                  <p className="mt-0.5 text-[11px] font-medium text-success">
                                    soit {fcfa(Math.round(p.monthly * 10 / 12))}/mois
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Récapitulatif et total */}
                  <dl className="divide-y divide-line rounded-lg border border-line bg-white">
                    {[
                      ["Structure", `${form.structureName} · ${form.city}`],
                      ["Type", KINDS.find((k) => k.value === form.kind)?.label ?? ""],
                      ["Dirigeant", `${form.ownerName} · ${form.ownerPhone}`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between gap-4 px-4 py-2.5">
                        <dt className="text-sm text-subtle">{k}</dt>
                        <dd className="max-w-[60%] truncate text-right text-sm font-medium text-ink">{v}</dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-4 bg-[#F7FAFC] px-4 py-3">
                      <dt className="text-sm font-semibold text-ink">
                        Total à payer {period === "yearly" ? "pour l'année" : "pour le premier mois"}
                      </dt>
                      <dd className="amount text-lg font-bold text-primary">{fcfa(amount)}</dd>
                    </div>
                  </dl>

                  <p className="text-xs leading-relaxed text-subtle">
                    En créant ton compte, tu déclares exercer une activité de collecte déclarée et rester
                    responsable des fonds collectés. TontiHelm ne détient ni ne redistribue aucun fonds.
                  </p>
                </div>
              )}

              {/* ── Zone de paiement (après choix du plan) ── */}
              {step === 3 && session && !finished && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {chosenPlan?.name} · {period === "yearly" ? "Annuel" : "Mensuel"}
                        </p>
                        <p className="text-xs text-subtle">Activation immédiate après confirmation</p>
                      </div>
                    </div>
                    <p className="amount text-base font-bold text-primary">{fcfa(session.amount || amount)}</p>
                  </div>

                  {verifying ? (
                    <div className="flex flex-col items-center rounded-lg border border-line bg-white p-8" role="status">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
                      <p className="mt-3 text-sm font-medium text-ink">Vérification du paiement…</p>
                      <p className="mt-1 text-xs text-subtle">Confirmation auprès de FedaPay, ne ferme pas cette page.</p>
                    </div>
                  ) : verifyStalled ? (
                    /* Vérification bornée écoulée SANS verdict : la main est
                        rendue à l'utilisateur — plus de boucle invisible. */
                    <div className="rounded-lg border border-line bg-white p-6 text-center" role="status">
                      <Clock className="h-8 w-8 text-accent mx-auto" aria-hidden />
                      <p className="mt-2 text-sm font-semibold text-ink">Confirmation encore en cours</p>
                      <p className="mt-1 text-xs leading-relaxed text-subtle">
                        Le paiement peut mettre une à deux minutes à être confirmé par FedaPay (Mobile Money).
                        Si tu viens de payer, relance la vérification dans un instant.
                      </p>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                        <Button
                          onClick={recheck}
                          className="h-11 bg-primary px-5 text-primary-foreground hover:bg-primary-hover"
                        >
                          <Loader2 className="h-4 w-4" aria-hidden /> Revérifier maintenant
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => { setSession(null); setCheckoutData(null); setVerifyStalled(false); setError(null); }}
                          className="h-11 border-line px-5"
                        >
                          Reprendre l&apos;inscription
                        </Button>
                      </div>
                    </div>
                  ) : redirecting || session.paymentUrl ? (
                    /* PRIMAIRE (patron Academia Helm) : redirection vers la page
                        de paiement hébergée FedaPay — pleine page. */
                    <div className="flex flex-col items-center rounded-lg border border-line bg-white p-6 text-center">
                      <ExternalLink className="h-8 w-8 text-primary" aria-hidden />
                      <p className="mt-2 text-sm font-medium text-ink">Page de paiement sécurisée FedaPay</p>
                      <p className="mt-1 text-xs text-subtle">
                        La redirection s&apos;ouvre… Après ton paiement, tu reviens ici et ton espace s&apos;active seul.
                      </p>
                      {session.paymentUrl && (
                        <Button asChild className="mt-3 h-11 bg-primary px-5 text-primary-foreground hover:bg-primary-hover">
                          <a href={session.paymentUrl}>Ouvrir la page de paiement</a>
                        </Button>
                      )}
                    </div>
                  ) : checkoutData ? (
                    /* REPLI : widget intégré (amount + description, sans id). */
                    <FedaPayCheckout
                      checkout={checkoutData}
                      onComplete={handleCheckoutComplete}
                      onError={handleCheckoutError}
                    />
                  ) : session.mode === "test" ? (
                    /* Mode test (préproduction) : simulation du verdict FedaPay. */
                    <div className="rounded-lg border-2 border-dashed border-accent/60 bg-[#FFF9EF] p-5">
                      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <Smartphone className="h-4 w-4 text-accent" aria-hidden />
                        Mode test — paiement simulé
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-subtle">
                        FedaPay n&apos;est pas connecté sur cet environnement : le paiement est simulé pour
                        valider le parcours complet. En production, le formulaire FedaPay (MTN MoMo, Moov,
                        carte) s&apos;affiche ici.
                      </p>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <Button
                          onClick={() => void verify("approved")}
                          className="h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary-hover"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden /> Simuler le paiement
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void verify("declined")}
                          className="h-11 flex-1 border-line"
                        >
                          Annuler le paiement
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center rounded-lg border border-line bg-white p-6 text-center">
                      <CreditCard className="h-8 w-8 text-primary" aria-hidden />
                      <p className="mt-2 text-sm text-subtle">Préparation du paiement…</p>
                    </div>
                  )}

                  {!verifyStalled && (
                    <button
                      type="button"
                      onClick={() => { setSession(null); setCheckoutData(null); setRedirecting(false); setError(null); }}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-subtle transition-colors hover:text-ink"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden /> Changer de plan
                    </button>
                  )}
                </div>
              )}

              {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}

              {!(step === 3 && session) && (
                <div className="flex gap-3">
                  {step > 1 && (
                    <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="h-12 border-line text-base">
                      Retour
                    </Button>
                  )}
                  {step < 3 ? (
                    <Button onClick={next} className="h-12 flex-1 bg-primary text-base text-primary-foreground hover:bg-primary-hover">
                      Continuer <ArrowRight className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void startPayment()}
                      disabled={loading || !plan}
                      className="h-12 flex-1 bg-primary text-base text-primary-foreground hover:bg-primary-hover"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Préparation du paiement…
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-4 w-4" aria-hidden />
                          Payer {fcfa(amount)} et activer mon espace
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              <p className="text-center text-sm text-subtle">
                Déjà un compte ?{" "}
                <a href="/connexion" className="font-medium text-primary underline-offset-4 hover:underline">
                  Se connecter
                </a>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
