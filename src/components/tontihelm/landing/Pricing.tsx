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
    description: "Pour démarrer avec 1 agent et 50 cotisants.",
    features: [
      "1 agent et 50 cotisants inclus",
      "Application agent hors ligne",
      "Lien de carnet pour chaque cotisant",
      "Paiement mobile money",
      "Clôture de caisse et audit",
      "Export Excel et PDF",
    ],
    highlight: false,
  },
  {
    name: "Pro",
    price: "35 000 FCFA",
    period: "par mois",
    description: "Pour structurer une équipe de 2 à 10 agents et 51 à 300 cotisants.",
    features: [
      "2 à 10 agents, 51 à 300 cotisants",
      "Tout le palier Démarrage",
      "Rappels automatiques aux cotisants en retard",
      "Support WhatsApp sous 24 h",
    ],
    highlight: true,
  },
  {
    name: "Institution",
    price: "75 000 FCFA",
    period: "par mois",
    description: "Pour les SFD multi-agences : au-delà de 10 agents et 300 cotisants, jusqu'à 40 agents et 3 000 cotisants.",
    features: [
      "11 à 40 agents, 301 à 3 000 cotisants",
      "Tout le palier Pro",
      "Rapports réglementaires",
      "Multi-agences",
      "Support dédié sous 4 h ouvrées",
    ],
    highlight: false,
  },
];

export function Pricing({ onDemoRequest }: { onDemoRequest: () => void }) {
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
        <p className="mt-2 max-w-2xl text-sm text-subtle">
          Les paliers s'empilent : ce que Démarrage inclut, Pro l'inclut aussi, et Institution l'étend.
          Chaque limite affichée est appliquée par l'application quand tu crées tes agents et tes cotisants.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3 md:items-stretch">
          {PLANS.map((p) => (
            <Card
              key={p.name}
              className={cn(
                "card-hover animate-fade-in-up relative flex flex-col border-line",
                p.highlight && "border-primary shadow-lg shadow-[#003887]/10 md:scale-[1.02]"
              )}
            >
              {p.highlight && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                  Le plus choisi
                </Badge>
              )}
              <CardHeader className={cn("pb-2", p.highlight && "bg-[#EEF4FD] rounded-t-lg")}>
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
          Paiement annuel : 2 mois inclus. Chaque cotisant suit sa tontine depuis son lien personnel — sans coût par message.
        </p>
        <div className="mt-8 text-center">
          <Button size="lg" onClick={onDemoRequest} className="bg-primary text-primary-foreground hover:bg-primary-hover h-12 px-6 text-base">
            Voir la démonstration en direct <ArrowRight className="h-5 w-5" aria-hidden />
          </Button>
          <p className="mt-3 text-sm text-subtle">L&apos;application se découvre en 2 minutes, directement dans ton navigateur.</p>
        </div>
      </div>
    </section>
  );
}
