"use client";
// TontiHelm — navigation vitrine (§13.2) : barre blanche, bouton d'essai visible au défilement sur mobile.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, ArrowRight } from "lucide-react";
import { LogoWordmark } from "../Logo";

const LINKS = [
  { href: "#probleme", label: "Problème" },
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#questions", label: "Questions" },
];

export function Navbar({ onStartTrial }: { onStartTrial: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-6 lg:px-8">
        <a href="#accueil" aria-label="TontiHelm — retour à l'accueil">
          <LogoWordmark size={34} priority />
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
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
          <Button
            onClick={onStartTrial}
            className="hidden bg-primary text-primary-foreground hover:bg-primary-hover md:inline-flex"
          >
            Essayer 60 jours <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          {/* Bouton d'essai toujours visible sur mobile, même menu ouvert */}
          <Button onClick={onStartTrial} size="sm" className="bg-primary text-primary-foreground hover:bg-primary-hover md:hidden">
            Essayer 60 jours
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="border-line md:hidden" aria-label="Ouvrir le menu">
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-white p-0">
              <div className="border-b border-line p-4">
                <SheetTitle className="text-left">
                  <LogoWordmark size={30} />
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
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
