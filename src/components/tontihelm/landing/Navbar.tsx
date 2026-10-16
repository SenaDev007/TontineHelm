"use client";
// TontiHelm — navigation vitrine (§13.2) : barre blanche, logo officiel bien visible.
// « Démarrer mon inscription » (→ /inscription) et « Se connecter » (→ /connexion)
// sont visibles dès le haut de page : de vraies routes, des vrais liens.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, ArrowRight, LogIn, Sparkles } from "lucide-react";
import { LogoWordmark } from "../Logo";

const LINKS = [
  { href: "#probleme", label: "Problème" },
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#questions", label: "Questions" },
];

export function Navbar({ onDemoRequest }: { onDemoRequest: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between gap-3 px-4 md:h-24 md:gap-4 md:px-6 lg:px-8">
        <a href="#accueil" aria-label="TontiHelm — retour à l'accueil" className="shrink-0 py-1">
          <span className="inline-flex origin-left md:hidden max-[380px]:scale-[0.88]">
            <LogoWordmark size={44} priority />
          </span>
          <span className="hidden md:inline-flex">
            <LogoWordmark size={66} priority />
          </span>
        </a>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-subtle transition-colors hover:bg-muted hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Connexion : vraie route /connexion */}
          <Button variant="outline" asChild className="border-line">
            <a href="/connexion">
              <LogIn className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Se connecter</span>
              <span className="sm:hidden">Connexion</span>
            </a>
          </Button>
          {/* Inscription : vraie route /inscription, CTA principal */}
          <Button asChild className="hidden bg-primary text-primary-foreground hover:bg-primary-hover sm:inline-flex">
            <a href="/inscription">
              Démarrer mon inscription <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="border-line lg:hidden" aria-label="Ouvrir le menu">
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-white p-0">
              <div className="border-b border-line p-4">
                <SheetTitle className="text-left">
                  <LogoWordmark size={52} />
                </SheetTitle>
              </div>
              <nav className="flex flex-col gap-1 p-4" aria-label="Navigation mobile">
                {LINKS.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-3 text-base font-medium text-ink transition-colors hover:bg-muted"
                  >
                    {l.label}
                  </a>
                ))}
                <div className="my-2 h-px bg-line" aria-hidden />
                <a
                  href="/inscription"
                  className="flex items-center gap-2 rounded-md bg-primary px-3 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  <Sparkles className="h-4 w-4" aria-hidden /> Démarrer mon inscription
                </a>
                <a
                  href="/connexion"
                  className="flex items-center gap-2 rounded-md border border-line px-3 py-3 text-base font-medium text-ink transition-colors hover:bg-muted"
                >
                  <LogIn className="h-4 w-4" aria-hidden /> Se connecter
                </a>
                <a
                  href="#demonstration"
                  onClick={() => {
                    setOpen(false);
                    onDemoRequest();
                  }}
                  className="mt-1 rounded-md px-3 py-3 text-base font-medium text-primary transition-colors hover:bg-muted"
                >
                  Demander une démonstration
                </a>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
