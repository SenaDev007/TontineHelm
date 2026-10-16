"use client";
// TontiHelm — section tarifs (§13.2, section 7 et §11) : palier Pro mis en avant.
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Démarrage",
    price: "15 000 FCFA",
    period: "par mois",
    description: "Pour démarrer avec 2 agents et 150 cotisants.",
    features: ["Application agent hors ligne", "Reçus SMS facturés à l'usage", "Paiement mobile money", "Clôture de caisse et audit", "Export Excel et PDF"],
    highlight: false,
  },
  {
    name: "Pro",
    price: "35 000 FCFA",
    period: "par mois",
    description: "Pour structurer une équipe de 10 agents et 800 cotisants. Rappels WhatsApp inclus.",
    features: ["Tout le palier Démarrage", "Rappels WhatsApp", "Support WhatsApp sous 24 h"],
    highlight: true,
  },
  {
    name: "Institution",
    price: "75 000 FCFA",
    period: "par mois",
    description: "Pour les SFD multi-agences, 40 agents et 3 000 cotisants. Rapports réglementaires et accès API.",
    features: ["Tout le palier Pro", "Rapports réglementaires", "Multi-agences", "Accès API", "Support dédié sous 4 h ouvrées"],
    highlight: false,
  },
];

export function Pricing({ onStartTrial }: { onStartTrial: () => void }) {
  return (
    <section id="tarifs" className="bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-6 lg:px-8 lg:py-24">
        <h2 className="font-display max-w-3xl text-[24px] font-bold leading-tight tracking-tight md:text-[28px] lg:text-[36px]">
          Un abonnement fixe. Aucune commission sur tes collectes.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-subtle">
          300 clients à 500 FCFA par jour représentent environ 4,5 millions de FCFA par mois. L'abonnement
          Pro en représente moins de 1&nbsp;%.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3 md:items-stretch">
          {PLANS.map((p) => (
            <Card
              key={p.name}
              className={cn(
                "relative flex flex-col border-line",
                p.highlight && "border-primary shadow-lg shadow-[#0F6B4A]/10 md:scale-[1.02]"
              )}
            >
              {p.highlight && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                  Le plus choisi
                </Badge>
              )}
              <CardHeader className={cn("pb-2", p.highlight && "bg-[#F2F7F4] rounded-t-lg")}>
                <h3 className="font-display text-lg font-bold text-ink">{p.name}</h3>
                <p className="amount mt-2 text-3xl font-bold tracking-tight text-ink">
                  {p.price}
                  <span className="ml-1 text-sm font-medium text-subtle">{p.period}</span>
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="text-sm leading-relaxed text-subtle">{p.description}</p>
                <ul className="mt-4 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-ink">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-subtle">
          Paiement annuel : 2 mois offerts. Les SMS sont facturés à l'usage, tarif affiché avant envoi.
        </p>
        <div className="mt-8 text-center">
          <Button size="lg" onClick={onStartTrial} className="bg-primary text-primary-foreground hover:bg-[#0C5A3E] h-12 px-6 text-base">
            Essayer 60 jours gratuitement <ArrowRight className="h-5 w-5" aria-hidden />
          </Button>
        </div>
      </div>
    </section>
  );
}
