"use client";
// TontiHelm — section Démonstration (§13.2) : il n'existe pas de mode gratuit ;
// la découverte du produit passe par une démonstration accompagnée, demandée
// ici (formulaire enregistré côté API + relais WhatsApp direct).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isOfflineQueued, post } from "@/lib/client";
import { ArrowRight, CalendarClock, CheckCircle2, MessageCircle, Phone, Building2, User, MapPin } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const WHATSAPP_URL =
  "https://wa.me/2290141360803?text=" +
  encodeURIComponent(
    "Bonjour YEHI OR Tech,\nJe m'appelle ______. Je gère ______ (structure).\nJe veux voir TontiHelm en démonstration.\nMon numéro : ______"
  );

type FormState = {
  fullName: string;
  phone: string;
  structure: string;
  city: string;
  contributors: string;
  agents: string;
  message: string;
};

const EMPTY: FormState = {
  fullName: "",
  phone: "",
  structure: "",
  city: "",
  contributors: "",
  agents: "",
  message: "",
};

export function DemoSection() {
  const reduce = useReducedMotion();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [queuedOffline, setQueuedOffline] = useState(false);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.fullName.trim().length < 2) return setError("Saisis ton nom complet.");
    if (form.phone.replace(/[^0-9]/g, "").length < 8) return setError("Saisis ton numéro de téléphone complet.");
    if (form.structure.trim().length < 2) return setError("Saisis le nom de ta structure.");
    setLoading(true);
    try {
      const res = await post<{ ok: boolean }>("/api/demo/request", {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        structure: form.structure.trim(),
        city: form.city.trim() || undefined,
        contributors: form.contributors ? Number(form.contributors) : undefined,
        agents: form.agents ? Number(form.agents) : undefined,
        message: form.message.trim() || undefined,
      });
      if (isOfflineQueued(res)) {
        setQueuedOffline(true);
        setDone(true);
      } else {
        setDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="demonstration" className="bg-canvas">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 md:px-6 lg:grid-cols-[1fr_420px] lg:gap-16 lg:px-8 lg:py-24">
        {/* Argumentaire */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-[#EEF4FD] px-4 py-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-primary">
            <CalendarClock className="h-4 w-4" aria-hidden /> Démonstration
          </p>
          <h2 className="font-display mt-4 max-w-xl text-[24px] font-bold leading-tight tracking-tight md:text-[28px] lg:text-[36px]">
            Vois l&apos;application avec tes propres carnets, avant de t&apos;engager.
          </h2>
          <div className="mt-6 max-w-xl space-y-4 text-base leading-relaxed text-subtle">
            <p>
              Une heure suffit. Un conseiller YEHI OR Tech installe l&apos;application avec toi, enregistre
              un carnet réel de ta structure, paramètre un agent et suit une tournée complète en ta
              présence. Tu vois exactement ce que verront tes agents et tes cotisants.
            </p>
            <p>
              La démonstration se fait chez toi, au bureau ou par téléphone. À la fin, tu décides :
              tu choisis ton palier d&apos;abonnement et tes données de démonstration deviennent ton
              point de départ. Aucune inscription n&apos;est demandée pour voir l&apos;application.
            </p>
          </div>
          <ul className="mt-6 space-y-3">
            {[
              "Un conseiller dédié, qui connaît la collecte journalière au Bénin",
              "Un carnet réel de ta structure configuré pendant la démonstration",
              "Toutes tes questions : agrément, SMS, mobile money, exports",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm text-ink">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Formulaire */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
        >
          <Card className="card-hover border-line bg-surface shadow-lg shadow-[#003887]/8">
            <CardContent className="p-6 md:p-8">
              {done ? (
                <div className="py-6 text-center" role="status">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E6F6F3]">
                    <CheckCircle2 className="h-7 w-7 text-success" aria-hidden />
                  </div>
                  <h3 className="font-display mt-4 text-lg font-bold text-ink">
                    {queuedOffline ? "Enregistrée sur ton téléphone." : "Demande reçue."}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-subtle">
                    {queuedOffline ? (
                      <>Pas de réseau pour le moment : ta demande partira automatiquement au serveur dès
                      le retour de la connexion, et nous te contacterons sous 24 heures ouvrées.</>
                    ) : (
                      <>Nous vérifions ta demande et nous te contactons sous 24 heures ouvrées pour fixer
                      la démonstration. Garde ton téléphone à portée de main.</>
                    )}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-6 border-line"
                    onClick={() => {
                      setDone(false);
                      setQueuedOffline(false);
                      setForm(EMPTY);
                    }}
                  >
                    Faire une autre demande
                  </Button>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <h3 className="font-display text-lg font-bold text-ink">Demander une démonstration</h3>
                  <p className="mt-1 text-sm text-subtle">
                    Nous te rappelons sous 24 heures ouvrées. Aucun paiement n&apos;est demandé à cette étape.
                  </p>

                  <div className="mt-6 space-y-4">
                    <div>
                      <Label htmlFor="demo-name">Ton nom complet *</Label>
                      <div className="relative mt-1.5">
                        <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                        <Input id="demo-name" value={form.fullName} onChange={set("fullName")} className="pl-9" placeholder="Ahouansou Miriam" autoComplete="name" required />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="demo-phone">Ton numéro de téléphone *</Label>
                      <div className="relative mt-1.5">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                        <Input id="demo-phone" value={form.phone} onChange={set("phone")} className="pl-9" placeholder="+229 97 01 02 03" inputMode="tel" autoComplete="tel" required />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="demo-structure">Nom de ta structure *</Label>
                      <div className="relative mt-1.5">
                        <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                        <Input id="demo-structure" value={form.structure} onChange={set("structure")} className="pl-9" placeholder="Alafia Finance" required />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="demo-city">Ville</Label>
                        <div className="relative mt-1.5">
                          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                          <Input id="demo-city" value={form.city} onChange={set("city")} className="pl-9" placeholder="Parakou" autoComplete="address-level2" />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="demo-contributors">Cotisants (env.)</Label>
                        <Input id="demo-contributors" value={form.contributors} onChange={set("contributors")} className="mt-1.5" placeholder="300" inputMode="numeric" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="demo-message">Ta question, si tu en as une</Label>
                      <Textarea id="demo-message" value={form.message} onChange={set("message")} rows={3} className="mt-1.5" placeholder="Nous sommes 6 agents sur deux quartiers…" maxLength={600} />
                    </div>
                  </div>

                  {error && (
                    <p role="alert" className="mt-4 text-sm font-medium text-danger">
                      {error}
                    </p>
                  )}

                  <Button type="submit" size="lg" disabled={loading} className="mt-6 h-12 w-full text-base">
                    {loading ? "Envoi…" : (<>
                      Demander une démonstration <ArrowRight className="h-5 w-5" aria-hidden />
                    </>)}
                  </Button>

                  <div className="mt-5 border-t border-line pt-4 text-center">
                    <p className="text-xs text-subtle">Tu préfères écrire directement ?</p>
                    <a
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#25D366]/50 bg-[#E9F9EF] px-4 py-2 text-sm font-semibold text-[#128C4A] transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp direct
                    </a>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
