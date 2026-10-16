// TontiHelm — gabarit commun des pages légales (conditions d'utilisation,
// confidentialité, mentions légales) : en-tête sobre, colonne de lecture,
// pieds de page renvoyant vers le site.
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { LogoWordmark } from "@/components/tontihelm/Logo";

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  list?: string[];
  subsections?: { heading: string; paragraphs?: string[]; list?: string[] }[];
};

export function LegalPage({
  title,
  intro,
  updated,
  sections,
}: {
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto flex h-20 max-w-[840px] items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/" aria-label="TontiHelm — retour à l'accueil" className="shrink-0 py-1">
            <LogoWordmark size={48} priority />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-subtle transition-colors hover:bg-muted hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Retour au site
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[840px] flex-1 px-4 py-12 md:px-6 lg:py-16">
        <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-[#EEF4FD] px-4 py-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-primary">
          <FileText className="h-4 w-4" aria-hidden /> Document légal
        </p>
        <h1 className="font-display mt-4 text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[36px]">
          {title}
        </h1>
        <p className="mt-3 text-sm font-medium text-subtle">Dernière mise à jour : {updated}</p>
        <p className="mt-6 border-l-4 border-primary/70 bg-surface p-4 text-base leading-relaxed text-ink shadow-sm">
          {intro}
        </p>

        <div className="mt-10 space-y-10">
          {sections.map((s, i) => (
            <section key={s.heading} aria-labelledby={`legal-s-${i}`}>
              <h2 id={`legal-s-${i}`} className="font-display text-xl font-bold tracking-tight text-ink md:text-[22px]">
                {i + 1}. {s.heading}
              </h2>
              {s.paragraphs?.map((p, j) => (
                <p key={j} className="mt-4 text-[15px] leading-relaxed text-subtle">
                  {p}
                </p>
              ))}
              {s.list && (
                <ul className="mt-4 space-y-2.5">
                  {s.list.map((li, j) => (
                    <li key={j} className="flex gap-2.5 text-[15px] leading-relaxed text-subtle">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      <span>{li}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.subsections?.map((sub, j) => (
                <div key={j} className="mt-6 rounded-lg border border-line bg-surface p-5">
                  <h3 className="font-display text-base font-bold text-ink">{sub.heading}</h3>
                  {sub.paragraphs?.map((p, k) => (
                    <p key={k} className="mt-3 text-[15px] leading-relaxed text-subtle">
                      {p}
                    </p>
                  ))}
                  {sub.list && (
                    <ul className="mt-3 space-y-2">
                      {sub.list.map((li, k) => (
                        <li key={k} className="flex gap-2.5 text-[15px] leading-relaxed text-subtle">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                          <span>{li}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-lg border border-line bg-[#F4F7FB] p-5">
          <p className="text-sm leading-relaxed text-subtle">
            Une question sur ce document ? Écris-nous :{" "}
            <a href="mailto:contact@yehiortech.com" className="font-semibold text-primary hover:underline">
              contact@yehiortech.com
            </a>{" "}
            — YEHI OR Tech, Parakou, République du Bénin.
          </p>
        </div>
      </main>

      <footer className="border-t border-line bg-[#0A1428] py-6 text-center text-sm text-[#7C90B0]">
        <p>
          © {new Date().getFullYear()} TontiHelm — un produit de YEHI OR Tech · Parakou, République du Bénin ·{" "}
          <Link href="/conditions-utilisation" className="hover:text-white">CGU</Link> ·{" "}
          <Link href="/confidentialite" className="hover:text-white">Confidentialité</Link> ·{" "}
          <Link href="/mentions-legales" className="hover:text-white">Mentions légales</Link>
        </p>
      </footer>
    </div>
  );
}
