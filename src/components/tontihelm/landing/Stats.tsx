"use client";
// TontiHelm — section chiffres (§13.2, section 2) : quatre chiffres vrais par construction,
// compteurs animés au défilement une seule fois, désactivés si mouvement réduit.
import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

function Counter({ target, suffix, label, sense }: { target: number; suffix: string; label: string; sense: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      const raf = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(raf);
    }
    const duration = 900;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, target]);

  return (
    <div ref={ref} className="text-center md:text-left">
      <p className="amount font-display text-4xl font-bold tracking-tight text-primary md:text-[44px]">
        {value}
        <span className="text-primary">{suffix}</span>
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">{label}</p>
      <p className="mt-1 text-sm leading-snug text-subtle">{sense}</p>
    </div>
  );
}

export function Stats() {
  return (
    <section id="chiffres" className="bg-canvas">
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-x-4 gap-y-10 px-4 py-14 md:px-6 md:grid-cols-4 lg:px-8 lg:py-16">
        <Counter target={10} suffix=" s" label="par encaissement" sense="Ton agent passe vite à la maison suivante" />
        <Counter target={100} suffix=" %" label="des fonctions hors réseau" sense="Une coupure ne bloque plus la tournée" />
        <Counter target={0} suffix=" FCFA" label="détenu par nous" sense="Ton argent reste dans ta structure" />
        <Counter target={1} suffix=" h" label="de démonstration avec un conseiller" sense="On configure un carnet réel avec toi, en direct" />
      </div>
    </section>
  );
}
