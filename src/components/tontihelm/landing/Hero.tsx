"use client";
// TontiHelm — hero animé (§13.2, section 1) : fond nuit vivant (orbes + grille),
// texte en cascade, écran smartphone montrant de VRAIES captures de l'application
// (tournée, encaissement, tableau de bord) qui se relaient en fondu.
// Aucun mode gratuit : la découverte passe par une démonstration (#demonstration).
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, WifiOff, MessageSquareText, CheckCheck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const SCREENS = [
  { src: "/app-screens/screen-collect.png", label: "Encaissement — écran agent" },
  { src: "/app-screens/screen-tour.png", label: "Tournée du jour — écran agent" },
  { src: "/app-screens/screen-dashboard.png", label: "Tableau de bord — back-office" },
];

/* ── Orbe décoratif animé (lent, infini) ── */
function Orb({
  className,
  duration = 14,
  children,
}: {
  className?: string;
  duration?: number;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={`pointer-events-none absolute ${className ?? ""}`} aria-hidden>
      <motion.div
        className="h-full w-full rounded-full blur-3xl"
        animate={reduce ? undefined : { x: [0, 26, -18, 0], y: [0, -20, 14, 0], scale: [1, 1.08, 0.95, 1] }}
        transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/* ── Écran smartphone : vraies captures de l'application, rotation en fondu ── */
function PhoneMockup() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SCREENS.length), 4800);
    return () => clearInterval(id);
  }, []);

  const current = SCREENS[index];

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 32, rotate: 2 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, ease: EASE }}
      className="relative mx-auto w-full max-w-[320px]"
      role="img"
      aria-label={`Aperçu réel de l'application : ${current.label}`}
    >
      {/* Halo lumineux derrière le téléphone */}
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(0,143,245,0.22),transparent_65%)] blur-2xl" aria-hidden />

      {/* Téléphone flottant */}
      <motion.div
        animate={reduce ? undefined : { y: [0, -12, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative rounded-[36px] border border-[#2A3B5C] bg-[#0D1B33] p-[10px] shadow-2xl shadow-black/60 ring-1 ring-white/10"
      >
        {/* Écran */}
        <div className="relative overflow-hidden rounded-[26px] bg-white">
          <div className="aspect-[390/812] w-full">
            <AnimatePresence mode="popLayout">
              <motion.img
                key={current.src}
                src={current.src}
                alt={current.label}
                className="absolute inset-0 h-full w-full object-cover object-top"
                initial={reduce ? undefined : { opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.65, ease: EASE }}
              />
            </AnimatePresence>
          </div>

          {/* Reflet diagonal sur l'écran */}
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.16)_0%,transparent_28%,transparent_72%,rgba(255,255,255,0.05)_100%)]"
            aria-hidden
          />
          {/* Encoche */}
          <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-[#0D1B33]" aria-hidden />
        </div>

        {/* Boutons latéraux */}
        <div className="absolute -right-[2px] top-24 h-12 w-[3px] rounded-full bg-[#2A3B5C]" aria-hidden />
        <div className="absolute -right-[2px] top-40 h-8 w-[3px] rounded-full bg-[#2A3B5C]" aria-hidden />
      </motion.div>

      {/* Pastille : vraie capture */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.5, duration: 0.5, ease: EASE }}
        className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#2A3B5C] bg-[#0D1B33]/95 px-3.5 py-1.5 shadow-lg backdrop-blur"
      >
        <CheckCheck className="h-3.5 w-3.5 text-gold" aria-hidden />
        <span className="whitespace-nowrap text-[11px] font-medium text-[#DCE6F5]">
          Captures réelles de l&apos;application
        </span>
      </motion.div>

      {/* Indicateurs d'écran */}
      <div className="absolute -bottom-12 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden>
        {SCREENS.map((s, i) => (
          <button
            key={s.src}
            type="button"
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? "w-6 bg-gold" : "w-1.5 bg-[#3A4C6E] hover:bg-[#5A6E93]"
            }`}
            aria-label={`Voir : ${s.label}`}
          />
        ))}
      </div>
    </motion.div>
  );
}

/* ── Puce de preuve (animée au survol) ── */
function ProofChip({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
      }}
      className="flex items-center gap-2 rounded-full border border-[#2A3B5C] bg-[#101F3A]/80 px-3.5 py-1.5 text-[13px] font-medium text-[#C9D6EA] backdrop-blur transition-colors hover:border-gold/50 hover:text-white"
    >
      <Icon className="h-3.5 w-3.5 text-gold" aria-hidden />
      {children}
    </motion.li>
  );
}

export function Hero({
  onDemoRequest,
  onStartTrial,
}: {
  onDemoRequest: () => void;
  onStartTrial: () => void;
}) {
  const reduce = useReducedMotion();

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
  };
  const item = {
    hidden: { opacity: 0, y: 22 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
  };

  return (
    <section id="accueil" className="relative overflow-hidden bg-ink text-white">
      {/* Fond photographique officiel (assets du dépôt) — desktop / mobile */}
      <div className="absolute inset-0" aria-hidden>
        <picture>
          <source media="(max-width: 767px)" srcSet="/Background mobile.png" />
          {/* eslint-disable-next-line @next/next/no-img-element -- décoratif, fond plein cadre */}
          <img
            src="/Background desktop.png"
            alt=""
            className="h-full w-full object-cover object-center md:object-[75%_center]"
            loading="eager"
            fetchPriority="high"
          />
        </picture>
      </div>
      {/* Voile nuit pour la lisibilité du texte (plus dense à gauche, côté copy) */}
      <div
        className="absolute inset-0 bg-[linear-gradient(100deg,rgba(10,20,40,0.98)_0%,rgba(10,20,40,0.93)_45%,rgba(13,27,51,0.78)_100%)]"
        aria-hidden
      />

      {/* Fond animé : grille + orbes discrets par-dessus la photo */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(35,51,80,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(35,51,80,0.5) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 90% 70% at 50% 0%, black 35%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 0%, black 35%, transparent 100%)",
        }}
        aria-hidden
      />
      <Orb className="left-[-8%] top-[-12%] h-72 w-72" duration={16}>
        <div className="h-full w-full bg-[radial-gradient(circle,rgba(0,184,176,0.20),transparent_70%)]" />
      </Orb>
      <Orb className="right-[-6%] top-[18%] h-96 w-96" duration={13}>
        <div className="h-full w-full bg-[radial-gradient(circle,rgba(0,143,245,0.16),transparent_70%)]" />
      </Orb>
      <Orb className="bottom-[-22%] left-[30%] h-80 w-80" duration={18}>
        <div className="h-full w-full bg-[radial-gradient(circle,rgba(255,184,0,0.10),transparent_70%)]" />
      </Orb>

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-4 pb-24 pt-14 md:px-6 md:pt-24 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <motion.div variants={container} initial={reduce ? false : "hidden"} animate="show">
          <motion.p
            variants={item}
            className="inline-flex items-center gap-2 rounded-full bg-gold/15 px-4 py-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-gold [text-shadow:0_1px_10px_rgba(10,20,40,0.6)]"
          >
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
            </span>
            Application de gestion de tontine · Bénin
          </motion.p>

          <motion.h1
            variants={item}
            className="font-display mt-5 text-[32px] font-bold leading-[1.15] tracking-tight md:text-[40px] lg:text-[56px]"
          >
            Un carnet perdu, ce sont des <span className="text-gold">mois de cotisations</span> envolés.
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-6 max-w-xl text-base leading-relaxed text-[#C4D2E8] [text-shadow:0_1px_12px_rgba(10,20,40,0.5)] md:text-lg"
          >
            TontiHelm remplace le carnet papier par une application qui marche sans réseau. Tes agents
            encaissent en 10 secondes, tes clients reçoivent leur reçu, ta caisse se clôture chaque soir.
          </motion.p>

          <motion.div variants={item} className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              onClick={onDemoRequest}
              className="h-12 px-6 text-base"
            >
              Demander une démonstration <ArrowRight className="h-5 w-5" aria-hidden />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={onStartTrial}
              className="h-12 border-[#4A5E80] bg-white/5 px-6 text-base text-white hover:border-gold/70 hover:bg-[#15243E] hover:text-white"
            >
              Inscrire ma structure
            </Button>
          </motion.div>

          <motion.p variants={item} className="mt-3 text-sm text-[#93A7C6]">
            Démonstration avec un conseiller · Réponse sous 24 heures ouvrées
          </motion.p>

          <motion.ul
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.9 } } }}
            initial={reduce ? false : "hidden"}
            animate="show"
            className="mt-6 flex flex-wrap gap-2 lg:mt-8"
          >
            <ProofChip icon={WifiOff}>Fonctionne sans réseau</ProofChip>
            <ProofChip icon={MessageSquareText}>Reçu SMS immédiat</ProofChip>
            <ProofChip icon={CheckCheck}>Caisse clôturée chaque soir</ProofChip>
          </motion.ul>
        </motion.div>

        <div className="relative lg:pl-4">
          <PhoneMockup />
        </div>
      </div>

      {/* Vague de transition vers la section suivante */}
      <svg
        className="relative -mb-px block w-full text-canvas"
        viewBox="0 0 1440 72"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path fill="currentColor" d="M0,32 C240,72 480,72 720,48 C960,24 1200,24 1440,48 L1440,72 L0,72 Z" />
      </svg>
    </section>
  );
}
