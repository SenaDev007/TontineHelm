"use client";
// TontiHelm — questions fréquentes (§13.2, section 8) et appel final (section 9).
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowRight } from "lucide-react";

const FAQ = [
  {
    q: "Puis-je voir l'application avant de m'inscrire ?",
    a: "Oui. Demande une démonstration : un conseiller installe l'application avec toi et configure un carnet réel de ta structure, agent par agent. Aucune inscription n'est nécessaire à cette étape.",
  },
  {
    q: "TontiHelm garde-t-il l'argent ?",
    a: "Non. L'argent va du cotisant à ta structure. Nous enregistrons les opérations et nous produisons les rapports.",
  },
  {
    q: "Dois-je être agréé ?",
    a: "La loi béninoise exige l'agrément du ministre de l'Économie et des Finances pour collecter l'épargne. Tu peux t'inscrire sans le joindre : nous le vérifions avec toi avant l'activation définitive de ton compte.",
  },
  {
    q: "Ça marche sans internet ?",
    a: "Oui. Tout l'écran agent fonctionne hors réseau. La synchronisation part automatiquement au retour du signal.",
  },
  {
    q: "Mes agents ne sont pas à l'aise avec le téléphone.",
    a: "Un encaissement tient en 2 touches. Nous formons tes agents lors de la mise en service.",
  },
  {
    q: "Mes clients ont-ils besoin d'un smartphone ?",
    a: "Non. Ils reçoivent leur reçu par SMS sur n'importe quel téléphone.",
  },
  {
    q: "Mes données restent-elles à moi si j'arrête ?",
    a: "Oui. Tu exportes tout en Excel à tout moment. En cas d'impayé, ton compte passe en lecture seule, sans suppression.",
  },
  {
    q: "Où sont stockées mes données ?",
    a: "Chez un hébergeur sécurisé, avec sauvegarde quotidienne. Chaque structure accède uniquement à ses propres données.",
  },
];

export function Faq() {
  return (
    <section id="questions" className="bg-canvas">
      <div className="mx-auto max-w-[720px] px-4 py-16 md:px-6 lg:px-8 lg:py-24">
        <h2 className="font-display text-[24px] font-bold leading-tight tracking-tight md:text-[28px] lg:text-[36px]">
          Questions fréquentes
        </h2>
        <Accordion type="single" collapsible className="mt-8">
          {FAQ.map((f, i) => (
            <AccordionItem key={i} value={`q${i}`} className="border-line">
              <AccordionTrigger className="text-left text-base font-semibold text-ink hover:text-primary hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-subtle">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

export function FinalCta({ onDemoRequest }: { onDemoRequest: () => void }) {
  return (
    <section id="contact" className="bg-ink text-white">
      <div className="mx-auto max-w-[1200px] px-4 py-16 text-center md:px-6 lg:px-8 lg:py-24">
        <h2 className="font-display mx-auto max-w-2xl text-[24px] font-bold leading-tight tracking-tight md:text-[28px] lg:text-[36px]">
          Ferme ton carnet papier ce mois-ci.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[#AFC2DE] md:text-lg">
          Demande une démonstration : un conseiller installe l&apos;application chez un de tes agents et
          configure tes carnets avec toi.
        </p>
        <div className="mt-8">
          <Button size="lg" onClick={onDemoRequest} className="bg-primary text-primary-foreground hover:bg-primary-hover h-12 px-6 text-base">
            Demander une démonstration <ArrowRight className="h-5 w-5" aria-hidden />
          </Button>
          <p className="mt-3 text-sm text-[#7C90B0]">Nous te répondons sous 24 heures ouvrées.</p>
        </div>
      </div>
    </section>
  );
}

