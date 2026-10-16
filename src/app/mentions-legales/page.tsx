import type { Metadata } from "next";
import { LegalPage } from "@/components/tontihelm/legal/LegalPage";

export const metadata: Metadata = {
  title: "Mentions légales — TontiHelm",
  description:
    "Mentions légales du site et de l'application TontiHelm : éditeur YEHI OR Tech (Parakou, Bénin), hébergeurs, directeur de la publication, propriété intellectuelle. Conformes au Code du numérique béninois.",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      title="Mentions légales"
      updated="16 octobre 2026"
      intro="Conformément à la loi n° 2017-20 du 26 avril 2018 portant Code du numérique de la République du Bénin, qui impose à tout éditeur de service de communication au public en ligne de s'identifier clairement, les présentes mentions renseignent l'éditeur du site et de l'application TontiHelm, l'hébergeur, le directeur de la publication et le régime de la propriété intellectuelle."
      sections={[
        {
          heading: "Éditeur du service",
          paragraphs: [
            "Le site et l'application TontiHelm sont édités par YEHI OR Tech, entreprise de technologie établie à Parakou (République du Bénin), fondée en 2025, spécialisée dans les solutions numériques de gestion pour l'Afrique de l'Ouest.",
          ],
          list: [
            "Éditeur : YEHI OR Tech — Parakou, département du Borgou, République du Bénin.",
            "Courriel de contact : contact@yehiortech.com.",
            "Téléphone / WhatsApp : +229 01 41 36 08 03.",
            "Registre du commerce et du crédit mobilier (RCCM) : [numéro à compléter par l'éditeur].",
            "Identifiant fiscal unique (IFU) : [numéro à compléter par l'éditeur].",
          ],
        },
        {
          heading: "Directeur de la publication",
          paragraphs: [
            "La direction de la publication est assurée par le représentant légal de YEHI OR Tech. Il est joignable via les coordonnées de l'éditeur indiquées ci-dessus et répond des contenus publiés sur le site, au sens des obligations de responsabilité de l'éditeur prévues par le Code du numérique.",
          ],
        },
        {
          heading: "Hébergeurs",
          paragraphs: [
            "Le site vitrine et l'application web TontiHelm sont distribués par une plateforme d'hébergement applicatif internationale (Vercel Inc., 440 N Barranca Avenue 41313, Covina, CA 91723, États-Unis — abuse@vercel.com). Le serveur applicatif (API) est opéré sur la plateforme Railway, et la base de données PostgreSQL est hébergée par Neon (Serverless, Inc.) dans l'Union européenne (région Europe de l'Ouest).",
            "Les coordonnées complètes des hébergeurs et leurs procédures de notification de contenus illicites sont disponibles sur leurs sites respectifs. Toute notification relative au site TontiHelm peut également être adressée à l'éditeur, qui la transmet à l'hébergeur compétent.",
          ],
        },
        {
          heading: "Nature du service",
          paragraphs: [
            "TontiHelm est une application d'enregistrement et de pilotage de tontines journalières. L'éditeur n'est ni établissement de crédit, ni système financier décentralisé, ni prestataire de services de paiement : il ne collecte, ne détient et ne transfère aucun fonds. Les relations financières liant la structure à ses cotisants demeurent étrangères à l'éditeur, dont le rôle se limite à la tenue du registre et à la production des rapports.",
            "Il n'existe pas de mode gratuit du service ; la découverte s'effectue par une démonstration accompagnée, demandée depuis le site. L'usage du service est soumis aux conditions générales d'utilisation accessibles en ligne.",
          ],
        },
        {
          heading: "Propriété intellectuelle",
          paragraphs: [
            "La dénomination TontiHelm, le logo, les textes, les maquettes d'écran, le code source et l'identité visuelle du site sont protégés par les droits de propriété intellectuelle attachés à la réglementation béninoise et communautaire en vigueur, notamment le Code du numérique. Toute reproduction ou représentation, totale ou partielle, sans autorisation écrite préalable de YEHI OR Tech est interdite et susceptible de poursuite.",
            "Les captures d'écran du site représentant l'application illustrent des données de démonstration enregistrées avec le consentement des personnes concernées. Les marques citées, y compris les noms de réseaux sociaux et de prestataires techniques, appartiennent à leurs titulaires respectifs.",
          ],
        },
        {
          heading: "Données à caractère personnel",
          paragraphs: [
            "Les traitements de données réalisés dans le cadre du site et du service sont décrits dans la politique de confidentialité, établie conformément à la loi n° 2009-09 du 22 mai 2009 portant organisation de la protection des données à caractère personnel en République du Bénin. L'autorité de contrôle compétente est l'Autorité de protection des données à caractère personnel (APDP).",
          ],
        },
        {
          heading: "Droit applicable",
          paragraphs: [
            "Le présent site et ses mentions sont soumis au droit de la République du Bénin et, en tant que de besoin, au droit OHADA. En cas de contestation relative au site, une solution amiable sera recherchée préalablement à toute action judiciaire devant les juridictions béninoises compétentes.",
          ],
        },
      ]}
    />
  );
}
