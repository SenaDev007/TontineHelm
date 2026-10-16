"use client";
// TontiHelm — sections Problème, Fonctionnalités, Méthode, Confiance (§13.2, sections 3 à 6).
// Chaque fonctionnalité répond à une carte du problème, dans le même ordre.
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CloudRain, CalendarX2, UserX, EyeOff, WifiOff, MessageSquareText,
  Scale, LayoutDashboard, Smartphone, FileCheck2, ArrowRight,
} from "lucide-react";

/* ── Section 3 · Problème : quatre cartes sur fond sombre, icône simple, aucune illustration décorative ── */
const PROBLEMS = [
  {
    icon: CloudRain,
    title: "Le carnet mouillé",
    body: "Une tournée sous la pluie, une page illisible, un client qui conteste 12 versements. Tu n'as aucune trace à lui montrer.",
  },
  {
    icon: CalendarX2,
    title: "L'écart découvert trop tard",
    body: "Tu constates la différence de caisse en fin de mois. L'agent ne se souvient plus du jour exact.",
  },
  {
    icon: UserX,
    title: "Le client qui doute",
    body: "Sans reçu, chaque cotisant garde un doute. Ce doute coûte des clients à ta structure.",
  },
  {
    icon: EyeOff,
    title: "Le gérant aveugle",
    body: "Tu ne sais pas combien tes agents ont encaissé hier. Tu l'apprends quand ils rapportent les carnets.",
  },
];

export function Problem() {
  return (
    <section id="probleme" className="bg-ink text-white">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-6 lg:px-8 lg:py-24">
        <h2 className="font-display max-w-3xl text-[24px] font-bold leading-tight tracking-tight md:text-[28px] lg:text-[36px]">
          Ton carnet fonctionne jusqu'au jour où il disparaît.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PROBLEMS.map((p) => (
            <Card key={p.title} className="border-[#233350] bg-[#101B31] text-white">
              <CardContent className="p-6">
                <p.icon className="h-6 w-6 tontihelm-icon text-info" aria-hidden />
                <h3 className="font-display mt-4 text-lg font-bold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#AFC2DE]">{p.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Section 4 · Fonctionnalités : six cartes, même ordre que le problème ── */
const FEATURES = [
  {
    icon: WifiOff,
    title: "Collecte sans réseau",
    hook: "Le réseau coupe, la tournée continue.",
    body: "L'application enregistre chaque encaissement sur le téléphone de l'agent et l'envoie dès le retour du réseau. Rien ne se perd, rien ne s'écrase.",
  },
  {
    icon: MessageSquareText,
    title: "Reçu immédiat",
    hook: "Ton client garde une trace dans sa poche.",
    body: "Chaque versement déclenche un SMS avec le montant, le jour du cycle et le solde cumulé. Le doute disparaît.",
  },
  {
    icon: Scale,
    title: "Clôture de caisse",
    hook: "L'écart se voit le soir même.",
    body: "L'agent déclare ce qu'il remet. L'application compare avec ses encaissements et affiche la différence. Une fois validée, la journée est verrouillée.",
  },
  {
    icon: LayoutDashboard,
    title: "Tableau de bord gérant",
    hook: "Tu sais ce que chaque agent a encaissé avant qu'il rentre.",
    body: "Encaissements du jour, carnets en retard, écarts non résolus. Export Excel et PDF en un clic.",
  },
  {
    icon: Smartphone,
    title: "Paiement mobile money",
    hook: "Le client paie depuis son téléphone.",
    body: "L'agent envoie un lien de paiement. L'argent arrive directement sur le compte de ta structure.",
  },
  {
    icon: FileCheck2,
    title: "Journal d'audit",
    hook: "Chaque ligne a un auteur et une heure.",
    body: "Une correction ajoute une ligne et n'efface jamais la précédente. Ton contrôleur exporte le journal quand il veut.",
  },
];

export function Features() {
  return (
    <section id="fonctionnalites" className="bg-canvas">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-6 lg:px-8 lg:py-24">
        <h2 className="font-display max-w-3xl text-[24px] font-bold leading-tight tracking-tight md:text-[28px] lg:text-[36px]">
          Chaque problème du carnet a sa réponse dans l'application.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="card-hover animate-fade-in-up border-line bg-surface">
              <CardContent className="p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E8F1FD] text-primary">
                  <f.icon className="h-5 w-5 tontihelm-icon" aria-hidden />
                </div>
                <h3 className="font-display mt-4 text-lg font-bold text-ink">{f.title}</h3>
                <p className="mt-1 text-sm font-semibold text-primary">{f.hook}</p>
                <p className="mt-2 text-sm leading-relaxed text-subtle">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-10 text-center">
          {/* Voir l'application en action : vraie route /connexion */}
          <Button size="lg" variant="outline" asChild className="border-primary text-primary hover:bg-[#E8F1FD] hover:text-primary h-12 px-6 text-base">
            <a href="/connexion">
              Voir l'application en action <ArrowRight className="h-5 w-5" aria-hidden />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ── Section 5 · Méthode : quatre étapes courtes ── */
const STEPS = [
  "Tu inscris ta structure en quelques minutes, sans pièce à joindre.",
  "Nous configurons tes agents, tes carnets et tes règles de commission.",
  "Tes agents encaissent avec l'application dès la tournée suivante.",
  "Tu clôtures la caisse le soir et tu compares avec ton ancien carnet.",
];

export function Method() {
  return (
    <section id="methode" className="bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-6 lg:px-8 lg:py-24">
        <h2 className="font-display max-w-3xl text-[24px] font-bold leading-tight tracking-tight md:text-[28px] lg:text-[36px]">
          Quatre étapes entre ton carnet et ta première clôture numérique.
        </h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={i} className="relative">
              <div className="flex items-center gap-3">
                <span className="font-display amount flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                  {i + 1}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="hidden h-px flex-1 bg-line lg:block" aria-hidden />
                )}
              </div>
              <p className="mt-4 text-base leading-relaxed text-ink">{s}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10">
          {/* Inscription : vraie route /inscription */}
          <Button size="lg" asChild className="bg-primary text-primary-foreground hover:bg-primary-hover h-12 px-6 text-base">
            <a href="/inscription">
              Démarrer mon inscription <ArrowRight className="h-5 w-5" aria-hidden />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ── Section 6 · Confiance : où passe l'argent et qui voit quoi ── */
export function Trust() {
  return (
    <section id="confiance" className="bg-canvas">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[320px_1fr] lg:gap-16">
          <div>
            <p className="amount font-display text-[56px] font-bold leading-none tracking-tight text-primary md:text-[72px]">
              0 FCFA
            </p>
            <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-subtle">détenus par TontiHelm</p>
          </div>
          <div>
            <h2 className="font-display text-[24px] font-bold leading-tight tracking-tight md:text-[28px] lg:text-[36px]">
              TontiHelm ne touche jamais à l'argent de tes clients.
            </h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-ink">
              <p>
                Les fonds vont du cotisant à ta structure, en espèces ou par mobile money. Nous tenons le
                registre, pas la caisse.
              </p>
              <p>
                Nous vérifions ta structure et son agrément avant d'activer ton compte. Une structure
                non conforme ne passe pas.
              </p>
              <p>
                Tes données restent isolées de celles des autres structures. Chaque ligne du journal est
                horodatée et attribuée.
              </p>
            </div>
            <div className="mt-8">
              <Button variant="link" className="h-auto p-0 text-primary underline-offset-4" asChild>
                <a href="/confidentialite">
                  Lire comment nous protégeons tes données <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
