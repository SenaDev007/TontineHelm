"use client";
// TontiHelm — hero (§13.2, section 1) : la peur du carnet perdu avant la technologie.
// Fond encre : l'or d'accent reste lisible (6,7:1) sur « mois de cotisations ».
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export function PhoneMockup() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-[300px]"
      aria-label="Aperçu de l'écran d'encaissement de l'application agent"
      role="img"
    >
      <div className="rounded-[28px] border border-[#24382E] bg-[#0F1F17] p-3 shadow-2xl shadow-black/40">
        <div className="overflow-hidden rounded-[18px] bg-white">
          {/* Barre du haut */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-medium text-subtle" aria-hidden>‹</span>
            <span className="text-sm font-semibold text-ink">Carnet 0142</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F3EB] px-2 py-0.5 text-[10px] font-medium text-[#116635]">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Synchronisé
            </span>
          </div>
          {/* Fiche */}
          <div className="space-y-1 px-4 pt-4">
            <p className="font-display text-lg font-bold text-ink">Adjovi Marie</p>
            <p className="text-sm text-subtle">Jour 12 sur 31 · Albarika</p>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-[#F7F8F5] px-3 py-2.5">
              <span className="text-sm text-subtle">Solde cumulé</span>
              <span className="amount text-base font-semibold text-ink">6 000 FCFA</span>
            </div>
            <p className="pt-1 text-xs font-medium text-success">Carnet à jour</p>
          </div>
          {/* Montant */}
          <div className="px-4 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">Montant</p>
            <div className="mt-1 rounded-lg border-2 border-primary bg-[#F2F7F4] py-3 text-center">
              <span className="amount font-display text-2xl font-bold text-primary">500 FCFA</span>
            </div>
          </div>
          {/* Clavier */}
          <div className="grid grid-cols-3 gap-2 p-4" aria-hidden>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "00", "eff"].map((k) => (
              <div
                key={k}
                className="flex h-11 items-center justify-center rounded-lg border border-line bg-white text-base font-semibold text-ink"
              >
                {k}
              </div>
            ))}
          </div>
          {/* Bouton Encaisser */}
          <div className="px-4 pb-5">
            <div className="flex h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              Encaisser 500 FCFA
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function Hero({ onStartTrial }: { onStartTrial: () => void }) {
  return (
    <section id="accueil" className="bg-ink text-white">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">
            Logiciel de gestion de tontine · Bénin
          </p>
          <h1 className="font-display mt-4 text-[32px] font-bold leading-[1.15] tracking-tight md:text-[40px] lg:text-[56px]">
            Un carnet perdu, ce sont des <span className="text-accent">mois de cotisations</span> envolés.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-[#C6D2CB] md:text-lg">
            TontiHelm remplace le carnet papier par une application qui marche sans réseau. Tes agents
            encaissent en 10 secondes, tes clients reçoivent leur reçu, ta caisse se clôture chaque soir.
          </p>
          <div className="mt-8">
            <Button
              size="lg"
              onClick={onStartTrial}
              className="bg-primary text-primary-foreground hover:bg-[#13915F] h-12 px-6 text-base"
            >
              Essayer 60 jours gratuitement <ArrowRight className="h-5 w-5" aria-hidden />
            </Button>
            <p className="mt-3 text-sm text-[#8FA398]">Aucun paiement pour démarrer. Aucun engagement.</p>
          </div>
        </div>
        <div className="lg:pl-6">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
