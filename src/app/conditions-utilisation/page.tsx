import type { Metadata } from "next";
import { LegalPage } from "@/components/tontihelm/legal/LegalPage";

export const metadata: Metadata = {
  title: "Conditions d'utilisation — TontiHelm",
  description:
    "Conditions générales d'utilisation du service TontiHelm, édité par YEHI OR Tech (Parakou, République du Bénin), conformément au Code du numérique béninois et au droit OHADA.",
};

export default function ConditionsUtilisationPage() {
  return (
    <LegalPage
      title="Conditions générales d'utilisation"
      updated="16 octobre 2026"
      intro="Les présentes conditions régissent l'accès et l'utilisation de l'application TontiHelm, service d'enregistrement et de pilotage de tontines journalières édité par YEHI OR Tech, société de droit béninois établie à Parakou (République du Bénin). Toute inscription ou utilisation du service vaut acceptation pleine et entière des présentes conditions, conformément à la loi n° 2017-20 du 26 avril 2018 portant Code du numérique de la République du Bénin. Le service ne comporte pas de mode gratuit : la découverte de l'application passe par une démonstration accompagnée et l'usage repose sur un abonnement."
      sections={[
        {
          heading: "Objet et champ d'application",
          paragraphs: [
            "TontiHelm est une application de gestion de tontines journalières destinée aux structures de collecte d'épargne opérant au Bénin : enregistrement des cotisants et des carnets, encaissement avec ou sans réseau, reçus par SMS, clôture quotidienne de caisse, journal d'audit inaltérable et tableaux de bord. Le service est fourni sous forme d'application web accessible depuis un navigateur et installable sur l'écran d'accueil du téléphone (progressive web app).",
            "Les présentes conditions s'appliquent à tout utilisateur du service : le gérant de la structure (responsable du compte), les gestionnaires qu'il habilite, les agents de collecte qu'il crée, ainsi qu'aux demandeurs de démonstration. L'inscription à une démonstration n'entraîne aucune création de compte ni aucun engagement.",
          ],
        },
        {
          heading: "Statut de l'éditeur et cadre réglementaire",
          paragraphs: [
            "YEHI OR Tech édite TontiHelm en qualité de prestataire de services numériques au sens du Code du numérique de la République du Bénin. YEHI OR Tech n'est ni un établissement de crédit, ni un système financier décentralisé, ni un prestataire de services de paiement : l'entreprise ne collecte, ne détient et ne transfère à aucun moment les fonds des cotisants.",
            "Les fonds recueillis dans le cadre des tontines circulent directement entre le cotisant et la structure, en espèces ou par mobile money. La réglementation en vigueur dans l'Union économique et monétaire ouest-africaine et au Bénin exige l'agrément des structures qui collectent l'épargne publique auprès du Ministère en charge des Finances. En conséquence, l'activation d'un compte TontiHelm est subordonnée à la justification de cet agrément, et YEHI OR Tech peut refuser ou suspendre tout compte dont le justificatif est absent, illisible ou non conforme.",
          ],
        },
        {
          heading: "Inscription, activation et compte",
          paragraphs: [
            "L'inscription s'effectue par le formulaire du site : nom de la structure, type d'activité, référence de l'agrément (facultative à ce stade), identité et numéro de téléphone du dirigeant, code PIN à six chiffres. Aucune pièce justificative n'est demandée au moment de l'inscription : la vérification de l'agrément et de la conformité de la structure s'effectue avec le dirigeant avant l'activation, et tout justificatif peut être demandé à cette occasion. La demande est examinée par l'administration de YEHI OR Tech, qui valide, refuse avec motif ou demande des compléments. Le compte est activé après validation ; un délai de réponse de vingt-quatre heures ouvrées est visé.",
            "Le gérant est responsable de la confidentialité de son code PIN et de ceux des agents qu'il crée. Toute opération réalisée avec les identifiants du compte est réputée faite par le titulaire. La perte d'un téléphone n'entraîne pas la perte des données déjà synchronisées ; le gérant doit signaler immédiatement la compromission d'un compte afin que les accès soient suspendus.",
          ],
        },
        {
          heading: "Démonstration et abonnements",
          paragraphs: [
            "Il n'existe pas de mode gratuit du service. La découverte de TontiHelm passe par une démonstration, sur demande, au cours de laquelle un conseiller de YEHI OR Tech présente l'application avec un carnet réel de la structure. La demande de démonstration est sans engagement et n'ouvre pas de compte.",
            "L'usage du service repose sur un abonnement mensuel par paliers (Démarrage, Pro, Institution) dont les tarifs et contenus sont affichés sur la page des tarifs. Le paiement s'effectue par les moyens proposés sur la facture, y compris le paiement mobile money via le prestataire retenu. Les SMS envoyés aux cotisants sont facturés à l'usage, à un tarif affiché avant chaque envoi. Le non-paiement d'une facture entraîne le passage du compte en mode lecture seule : consultation et exports restent possibles, les encaissements sont bloqués, aucune donnée n'est supprimée.",
          ],
        },
        {
          heading: "Fonctionnement hors ligne et synchronisation",
          paragraphs: [
            "L'application est conçue pour fonctionner sans réseau : les encaissements réalisés hors connexion sont enregistrés sur le téléphone de l'agent, puis transmis automatiquement à la base de données centrale dès le retour du réseau. La transmission est idempotente : un encaissement enregistré une seule fois ne peut être compté deux fois.",
            "L'utilisateur reconnaît que les opérations réalisées hors ligne demeurent sur l'appareil jusqu'à leur synchronisation, et que la perte, la casse ou le remplacement non accompagné de l'appareil peuvent entraîner la perte des opérations non encore transmises. La clôture de caisse, le rapprochement et le journal d'audit reflètent uniquement les opérations synchronisées.",
          ],
        },
        {
          heading: "Obligations des utilisateurs",
          list: [
            "Ne s'inscrire qu'avec des informations exactes, à jour, et justifier d'un agrément en cours de validité lorsque la réglementation l'exige pour l'activité exercée.",
            "Enregistrer les cotisants et les encaissements de manière fidèle et complète ; s'abstenir de toute saisie fictive destinée à masquer un écart de caisse.",
            "Ne pas utiliser le service à des fins contraires à l'ordre public béninois, aux lois en vigueur ou aux droits des cotisants.",
            "Recueillir le consentement des cotisants à la réception de SMS de reçu et de rappel, et cesser l'envoi sur simple demande.",
            "Respecter les quotas d'usage raisonnable et ne pas tenter d'entraver, de saturer ou de contourner les mécanismes de sécurité du service.",
          ],
        },
        {
          heading: "Obligations de l'éditeur",
          paragraphs: [
            "YEHI OR Tech fournit le service avec le soin d'un professionnel raisonnable : disponibilité hors maintenance programmée, communication préalable des interruptions, assistance par WhatsApp et courriel dans les délais annoncés pour chaque palier, sauvegarde quotidienne des données et tenue du journal d'audit scellé.",
            "L'éditeur ne garantit pas une disponibilité absolue, le service dépendant de réseaux et d'infrastructures tiers. Les opérations déjà synchronisées ne sont ni modifiées ni supprimées à l'initiative de l'éditeur, sauf demande de la structure, d'une autorité compétente ou nécessité de conformité légale.",
          ],
        },
        {
          heading: "Propriété intellectuelle",
          paragraphs: [
            "L'application, son code, sa marque, son logo, ses textes et ses maquettes sont la propriété exclusive de YEHI OR Tech, protégés notamment par le Code du numérique et la réglementation communautaire sur la propriété intellectuelle. Toute reproduction, adaptation ou diffusion sans autorisation écrite est interdite.",
            "Les données saisies par la structure (cotisants, carnets, encaissements, clôtures) demeurent la propriété de la structure, qui peut les exporter à tout moment aux formats proposés. Le simple fait d'héberger ou de traiter ces données pour l'exécution du service ne confère à YEHI OR Tech aucun droit de propriété sur elles.",
          ],
        },
        {
          heading: "Responsabilité",
          paragraphs: [
            "YEHI OR Tech n'est pas partie aux relations entre la structure et ses cotisants, ni aux litiges relatifs aux fonds collectés. La responsabilité de l'éditeur ne peut être recherchée pour les écarts de caisse, les erreurs de saisie, les retards de synchronisation imputables au réseau, ni pour les dommages indirects tels que perte de clientèle ou manque à gagner.",
            "La responsabilité totale de l'éditeur, toutes causes confondues, est plafonnée au montant des abonnements réglés par la structure au cours des six derniers mois précédant le fait générateur. Les stipulations du présent article n'écartent pas les garanties légales impératives, notamment celles issues du droit de la consommation applicable au Bénin.",
          ],
        },
        {
          heading: "Suspension, résiliation et fin de compte",
          paragraphs: [
            "En cas de manquement aux présentes conditions, de fraude caractérisée, d'agrément retiré ou d'inactivité prolongée, YEHI OR Tech peut suspendre le compte après notification motivée. La structure peut résilier à tout moment ; ses données restent exportables pendant une période de quarante jours, au terme de laquelle elles sont supprimées, à l'exception des écritures comptables dont la conservation est exigée par la réglementation en vigueur.",
          ],
        },
        {
          heading: "Modifications des conditions",
          paragraphs: [
            "Les présentes conditions peuvent être modifiées pour évoluer avec le service ou avec la réglementation. La version applicable est celle affichée en ligne au moment de l'utilisation, datée et versionnée ; les modifications substantielles sont notifiées par SMS ou courriel au gérant au moins quinze jours avant leur entrée en vigueur.",
          ],
        },
        {
          heading: "Droit applicable et règlement des litiges",
          paragraphs: [
            "Les présentes conditions sont soumises au droit de la République du Bénin et, en tant que de besoin, aux Actes uniformes de l'Organisation pour l'Harmonisation en Afrique du Droit des Affaires (OHADA). Tout différend fait l'objet d'une tentative de résolution amiable par écrit dans un délai de trente jours.",
            "À défaut d'accord amiable, le litige est porté devant les juridictions compétentes de la République du Bénin, conformément aux règles de compétence du Code de procédure civile, commerciale, administrative, financière, sociale et pénale en vigueur, OHADA s'agissant des actes uniformes applicables.",
          ],
        },
      ]}
    />
  );
}
