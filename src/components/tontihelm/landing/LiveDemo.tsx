"use client";
// TontiHelm — démonstration EN DIRECT (§13.2) : pas de formulaire, pas d'attente.
// Le visiteur voit l'application fonctionner dans son navigateur : l'agent crée
// un client, encaisse jour après jour, le client consulte son carnet sur son
// lien, la caisse se clôture le soir. Tout est interactif et simulé côté client.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BadgeCheck, BellRing, CalendarCheck2, Check,
  CircleDollarSign, Link2, Lock, MessageCircle, Play, RotateCcw,
  Smartphone, UserPlus, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const WHATSAPP_URL =
  "https://wa.me/2290141360803?text=" +
  encodeURIComponent(
    "Bonjour YEHI OR Tech,\nJe m'appelle ______. Je gère ______ (structure).\nJ'ai vu la démonstration TontiHelm, j'ai une question."
  );

const DAILY = 500;
const CYCLE = 31;
const CLIENT = { name: "Ahouansou Miriam", phone: "+229 97 01 02 03", area: "Albarika" };

type Step = 0 | 1 | 2 | 3;

const STEPS: { title: string; kicker: string; detail: string }[] = [
  {
    title: "L'agent crée le client",
    kicker: "Sur le marché, en 30 secondes",
    detail: "Identité, téléphone, mise journalière, durée du cycle. Le carnet démarre immédiatement et le lien personnel du client est prêt.",
  },
  {
    title: "Chaque jour, l'encaissement",
    kicker: "Deux touches, même sans réseau",
    detail: "L'agent touche la journée du client et encaisse. La marque apparaît sur le carnet — essaie : touche les jours ou le bouton.",
  },
  {
    title: "Le client suit son carnet",
    kicker: "Son lien, dans sa poche",
    detail: "Miriam a reçu un seul lien par WhatsApp. Elle y voit chaque versement, son solde et l'évolution — ce que tu vois ici est sa vue exacte.",
  },
  {
    title: "Le soir, la caisse",
    kicker: "L'écart se voit avant le litige",
    detail: "L'agent déclare ce qu'il remet : la comparaison est automatique, la journée validée est verrouillée.",
  },
];

function fmt(n: number): string {
  return `${n.toLocaleString("fr-FR")} F`;
}

/* ── Étape 1 : création du client sur le terrain ── */
function StepCreate({ created, onFill, filled, onCreate }: { created: boolean; filled: boolean; onFill: () => void; onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8F1FD] text-primary"><UserPlus className="h-4 w-4" aria-hidden /></span>
        <div>
          <p className="text-[13px] font-bold text-ink">Nouveau client</p>
          <p className="text-[10px] text-subtle">Application agent · terrain</p>
        </div>
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        {!created ? (
          <>
            {[
              { label: "Nom complet", value: filled ? CLIENT.name : "" },
              { label: "Téléphone (WhatsApp)", value: filled ? CLIENT.phone : "" },
              { label: "Quartier", value: filled ? CLIENT.area : "" },
            ].map((f) => (
              <div key={f.label} className="rounded-lg border border-line bg-white px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-subtle">{f.label}</p>
                <p className={cn("amount mt-0.5 text-[13px]", f.value ? "text-ink" : "text-subtle/60")}>{f.value || "—"}</p>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-line bg-white px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-subtle">Mise / jour</p>
                <p className={cn("amount mt-0.5 text-[13px]", filled ? "text-ink" : "text-subtle/60")}>{filled ? fmt(DAILY) : "—"}</p>
              </div>
              <div className="rounded-lg border border-line bg-white px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-subtle">Cycle</p>
                <p className={cn("amount mt-0.5 text-[13px]", filled ? "text-ink" : "text-subtle/60")}>{filled ? `${CYCLE} jours` : "—"}</p>
              </div>
            </div>
            <Button
              className="mt-1 h-11 w-full bg-primary text-primary-foreground hover:bg-primary-hover"
              onClick={filled ? onCreate : onFill}
            >
              {filled ? (
                <><BadgeCheck className="h-4 w-4" aria-hidden /> Créer le client et son carnet</>
              ) : (
                <><Play className="h-4 w-4" aria-hidden /> Remplir l'exemple</>
              )}
            </Button>
          </>
        ) : (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }} className="space-y-3">
            <div className="rounded-xl border border-[#B5E8E5] bg-[#F0FBFA] p-3.5 text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#DFF6F4]"><BadgeCheck className="h-5 w-5 text-success" aria-hidden /></span>
              <p className="mt-2 text-[13px] font-bold text-ink">{CLIENT.name} enregistrée</p>
              <p className="text-[11px] text-subtle">Carnet 0102 · mise {fmt(DAILY)} · {CYCLE} jours</p>
            </div>
            <div className="rounded-xl border border-line bg-white p-3">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-subtle"><Link2 className="h-3 w-3" aria-hidden /> Son lien de carnet (généré)</p>
              <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-ink">tontine-helm.vercel.app/carnet/k7Hm…9sQz</p>
              <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-[#E9F9EF] px-3 py-2">
                <MessageCircle className="h-4 w-4 shrink-0 text-[#128C4A]" aria-hidden />
                <p className="text-[11px] leading-snug text-[#128C4A]">
                  <span className="font-semibold">Message WhatsApp prêt</span> — « Miriam, voici le lien de ton carnet… »
                </p>
              </div>
              <p className="mt-2 text-center text-[10px] text-subtle">Un seul lien, envoyé une fois. Aucun SMS.</p>
            </div>
            <p className="text-center text-[11px] font-medium text-primary">Passe à l&apos;étape suivante pour encaisser →</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ── Étape 2 : encaissement journalier ── */
function StepCollect({ marked, onMark, onCollect }: { marked: number[]; onMark: (d: number) => void; onCollect: () => void }) {
  const nextDay = marked.length + 1;
  const done = marked.length >= CYCLE;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8F1FD] text-primary"><Wallet className="h-4 w-4" aria-hidden /></span>
          <div>
            <p className="text-[13px] font-bold text-ink">Encaisser — {CLIENT.name}</p>
            <p className="text-[10px] text-subtle">Carnet 0102 · Albarika</p>
          </div>
        </div>
        <span className="rounded-full bg-[#DFF6F4] px-2 py-0.5 text-[10px] font-bold text-[#00806B]">hors réseau</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: CYCLE }, (_, i) => i + 1).map((d) => {
            const isMarked = marked.includes(d);
            const isNext = d === nextDay && !done;
            return (
              <button
                key={d}
                onClick={() => isMarked ? undefined : onMark(d)}
                disabled={isMarked || (d > nextDay)}
                aria-label={isMarked ? `Jour ${d} versé` : `Encaisser le jour ${d}`}
                className={cn(
                  "flex h-9 items-center justify-center rounded-lg border text-[12px] font-semibold transition-all",
                  isMarked && "border-[#9ED9D3] bg-[#DFF6F4] text-[#00806B]",
                  isNext && "animate-pulse-soft border-primary bg-[#E8F1FD] text-primary shadow-sm",
                  !isMarked && !isNext && "border-line bg-[#F4F7FB] text-subtle",
                  d > nextDay && "opacity-60"
                )}
              >
                {isMarked ? <Check className="h-4 w-4" aria-hidden /> : d}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-[#F4F7FB] px-3 py-2.5">
          <span className="text-[11px] text-subtle">{marked.length} journée{marked.length > 1 ? "s" : ""} versée{marked.length > 1 ? "s" : ""}</span>
          <span className="amount text-[14px] font-bold text-ink">{fmt(marked.length * DAILY)}</span>
        </div>
        <Button
          className="mt-3 h-11 w-full bg-primary text-primary-foreground hover:bg-primary-hover"
          onClick={onCollect}
          disabled={done}
        >
          <Wallet className="h-4 w-4" aria-hidden /> {done ? "Cycle complet !" : `Encaisser la mise du jour (${fmt(DAILY)})`}
        </Button>
        <p className="mt-2 text-center text-[10px] text-subtle">Touche aussi les jours directement — même hors réseau.</p>
      </div>
    </div>
  );
}

/* ── Étape 3 : le carnet du client sur son lien ── */
function StepCarnet({ marked }: { marked: number[] }) {
  const progress = Math.round((marked.length / CYCLE) * 100);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[13px] font-bold text-ink">Alafia Finance</p>
        <p className="text-[10px] text-subtle">Carnet de {CLIENT.name} · lien personnel</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="rounded-xl border border-line bg-white p-3.5">
          <div className="flex items-center justify-between">
            <p className="amount text-[13px] font-bold text-ink">Carnet 0102</p>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#B5E8E5] bg-[#DFF6F4] px-2 py-0.5 text-[10px] font-semibold text-[#00806B]">
              <CalendarCheck2 className="h-3 w-3" aria-hidden /> {marked.length > 0 ? "À jour" : "À jour"}
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-end justify-between text-[10px]">
              <span className="font-semibold text-ink">{marked.length} / {CYCLE} journées versées</span>
              <span className="text-subtle">jour {marked.length} du cycle</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#EDF2F7]">
              <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.5, ease: EASE }} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-[#F4F7FB] px-2.5 py-2">
              <p className="flex items-center gap-1 text-[9px] font-semibold uppercase text-subtle"><CircleDollarSign className="h-2.5 w-2.5" aria-hidden /> Mise / jour</p>
              <p className="amount mt-0.5 text-[12px] font-bold text-ink">{fmt(DAILY)}</p>
            </div>
            <div className="rounded-lg bg-[#F4F7FB] px-2.5 py-2">
              <p className="flex items-center gap-1 text-[9px] font-semibold uppercase text-subtle"><Link2 className="h-2.5 w-2.5" aria-hidden /> Solde</p>
              <p className="amount mt-0.5 text-[12px] font-bold text-ink">{fmt(marked.length * DAILY)}</p>
            </div>
            <div className="rounded-lg bg-[#F4F7FB] px-2.5 py-2">
              <p className="flex items-center gap-1 text-[9px] font-semibold uppercase text-subtle"><BellRing className="h-2.5 w-2.5" aria-hidden /> Manqués</p>
              <p className="amount mt-0.5 text-[12px] font-bold text-ink">0</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {Array.from({ length: CYCLE }, (_, i) => i + 1).map((d) => {
              const isMarked = marked.includes(d);
              return (
                <div
                  key={d}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg border text-[11px] font-semibold",
                    isMarked ? "border-[#9ED9D3] bg-[#DFF6F4] text-[#00806B]" : "border-line bg-[#F4F7FB] text-subtle"
                  )}
                >
                  {isMarked ? <Check className="h-3.5 w-3.5" aria-hidden /> : d}
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-subtle">
          Mis à jour à l&apos;instant · Miriam consulte ce lien quand elle veut, sur son téléphone.
        </p>
      </div>
    </div>
  );
}

/* ── Étape 4 : clôture de caisse du soir ── */
function StepClosing({ marked, declared, onDeclare }: { marked: number[]; declared: boolean; onDeclare: () => void }) {
  const expected = marked.length * DAILY;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8F1FD] text-primary"><Lock className="h-4 w-4" aria-hidden /></span>
        <div>
          <p className="text-[13px] font-bold text-ink">Clôture de caisse</p>
          <p className="text-[10px] text-subtle">Fin de tournée · espèces attendues</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2.5">
          <div className="rounded-lg border border-line bg-white px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-subtle">Encaissements du jour</p>
            <p className="amount mt-0.5 text-[15px] font-bold text-ink">{fmt(expected)}</p>
            <p className="text-[10px] text-subtle">{marked.length} cotisant{marked.length > 1 ? "s" : ""} · espèces</p>
          </div>
          {declared ? (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: EASE }} className="rounded-xl border border-[#B5E8E5] bg-[#F0FBFA] p-3.5 text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#DFF6F4]"><BadgeCheck className="h-5 w-5 text-success" aria-hidden /></span>
              <p className="mt-2 text-[13px] font-bold text-ink">Journée validée</p>
              <p className="text-[11px] text-subtle">Écart : 0 FCFA · la journée est verrouillée, plus rien ne bouge.</p>
            </motion.div>
          ) : (
            <>
              <div className="rounded-lg border border-line bg-white px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-subtle">Espèces remises par l&apos;agent</p>
                <p className="amount mt-0.5 text-[15px] font-bold text-ink">{fmt(expected)}</p>
              </div>
              <Button className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary-hover" onClick={onDeclare}>
                <Lock className="h-4 w-4" aria-hidden /> Déclarer et valider la caisse
              </Button>
              <p className="text-center text-[10px] text-subtle">L&apos;écart se calcule tout seul : 0 FCFA ici.</p>
            </>
          )}
        </div>
        {declared && (
          <p className="mt-4 text-center text-[11px] font-medium text-primary">La démonstration est terminée — crée ton compte pour démarrer.</p>
        )}
      </div>
    </div>
  );
}

export function LiveDemoSection() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>(0);
  const [filled, setFilled] = useState(false);
  const [created, setCreated] = useState(false);
  const [marked, setMarked] = useState<number[]>([]);
  const [declared, setDeclared] = useState(false);

  const reset = () => {
    setStep(0);
    setFilled(false);
    setCreated(false);
    setMarked([]);
    setDeclared(false);
  };

  const markDay = (d: number) => {
    setMarked((m) => (m.includes(d) || d !== m.length + 1 ? m : [...m, d]));
  };
  const collectNext = () => {
    setMarked((m) => (m.length < CYCLE ? [...m, m.length + 1] : m));
  };

  const canNext = step === 0 ? created : step === 1 ? marked.length > 0 : step === 2 ? true : declared;
  const nextLabel = step === 3 ? "Terminer la démo" : "Continuer";

  return (
    <section id="demonstration" className="bg-canvas">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-6 lg:px-8 lg:py-24">
        {/* En-tête de section */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-[#EEF4FD] px-4 py-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Play className="h-4 w-4" aria-hidden /> Démonstration en direct
          </p>
          <h2 className="font-display mt-4 text-[24px] font-bold leading-tight tracking-tight md:text-[28px] lg:text-[36px]">
            Essaie TontiHelm maintenant — sans compte, sans attente.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-subtle">
            Pas de rendez-vous à prendre : l&apos;application se montre ici même, dans ton navigateur.
            Suis les quatre gestes d&apos;une journée de collecte — et touche ce que tes agents toucheront.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-[1fr_400px] lg:gap-16">
          {/* Colonne gauche : étapes et explications */}
          <div>
            {/* Indicateur d'étapes */}
            <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Étapes de la démonstration">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <button
                    onClick={() => setStep(i as Step)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition-all",
                      step === i
                        ? "border-primary/40 bg-[#EEF4FD] shadow-sm"
                        : "border-line bg-white hover:border-primary/30"
                    )}
                    aria-current={step === i ? "step" : undefined}
                  >
                    <span className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold",
                      step === i ? "bg-primary text-white" : i < step ? "bg-[#DFF6F4] text-[#00806B]" : "bg-[#EDF2F7] text-subtle"
                    )}>
                      {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                    </span>
                    <p className={cn("mt-2 text-[13px] font-semibold leading-tight", step === i ? "text-ink" : "text-subtle")}>{s.title}</p>
                  </button>
                </li>
              ))}
            </ol>

            {/* Détail de l'étape courante */}
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="mt-6"
              >
                <p className="text-[13px] font-semibold uppercase tracking-wide text-primary">{STEPS[step].kicker}</p>
                <h3 className="font-display mt-1 text-xl font-bold text-ink">{STEPS[step].title}</h3>
                <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-subtle">{STEPS[step].detail}</p>
              </motion.div>
            </AnimatePresence>

            {/* Contrôles */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                className="border-line"
                onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
                disabled={step === 0}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden /> Précédent
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary-hover"
                onClick={() => {
                  if (step === 3) {
                    reset();
                    return;
                  }
                  if (step === 1 && marked.length === 0) {
                    collectNext();
                    return;
                  }
                  setStep((s) => Math.min(3, s + 1) as Step);
                }}
              >
                {step === 3 ? (<><RotateCcw className="h-4 w-4" aria-hidden /> Recommencer</>) : (<>{nextLabel} <ArrowRight className="h-4 w-4" aria-hidden /></>)}
              </Button>
              <Button variant="ghost" onClick={reset} className="text-subtle">
                <RotateCcw className="h-4 w-4" aria-hidden /> Réinitialiser
              </Button>
              {!canNext && step === 0 && (
                <p className="text-xs text-subtle">Remplis l&apos;exemple dans le téléphone pour continuer.</p>
              )}
              {!canNext && step === 1 && (
                <p className="text-xs text-subtle">Encaisse au moins une mise pour continuer.</p>
              )}
              {!canNext && step === 3 && (
                <p className="text-xs text-subtle">Valide la caisse pour terminer.</p>
              )}
            </div>

            {/* Fin de démonstration : appel à l'action */}
            <Card className="mt-8 border-line bg-white shadow-lg shadow-[#003887]/8">
              <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-display text-base font-bold text-ink">Prêt pour de vrai ?</p>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-subtle">
                    Crée le compte de ta structure en 3 étapes, choisis ton palier, paie et démarre
                    ta première tournée aujourd&apos;hui.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  <Button asChild size="lg" className="h-12 bg-primary px-6 text-base text-primary-foreground hover:bg-primary-hover">
                    <a href="/inscription">Créer mon compte <ArrowRight className="h-5 w-5" aria-hidden /></a>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-12 border-[#25D366]/60 bg-[#E9F9EF] px-5 text-base text-[#128C4A] hover:bg-[#D2F2DE] hover:text-[#128C4A]">
                    <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-5 w-5" aria-hidden /> Une question ?
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Colonne droite : téléphone interactif */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            className="mx-auto w-full max-w-[340px]"
          >
            <div className="relative rounded-[2rem] border border-line bg-white p-2.5 shadow-2xl shadow-[#003887]/15">
              <div className="overflow-hidden rounded-[1.6rem] border border-line/60 bg-canvas">
                {/* Barre d'état factice */}
                <div className="flex items-center justify-between bg-white px-5 pb-1 pt-2.5">
                  <span className="amount text-[10px] font-semibold text-ink">09:41</span>
                  <div className="flex items-center gap-1.5 text-subtle">
                    <Smartphone className="h-3 w-3" aria-hidden />
                    <span className="text-[10px]">TontiHelm</span>
                  </div>
                </div>
                {/* Écran */}
                <div className="h-[520px]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={reduce ? false : { opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduce ? undefined : { opacity: 0, x: -24 }}
                      transition={{ duration: 0.35, ease: EASE }}
                      className="h-full"
                    >
                      {step === 0 && (
                        <StepCreate filled={filled} created={created} onFill={() => setFilled(true)} onCreate={() => setCreated(true)} />
                      )}
                      {step === 1 && <StepCollect marked={marked} onMark={markDay} onCollect={collectNext} />}
                      {step === 2 && <StepCarnet marked={marked} />}
                      {step === 3 && <StepClosing marked={marked} declared={declared} onDeclare={() => setDeclared(true)} />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-subtle">
              Interactif — touche les boutons comme tes agents le feront.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
