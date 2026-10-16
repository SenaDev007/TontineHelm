import type { Metadata } from "next";
import { LegalPage } from "@/components/tontihelm/legal/LegalPage";

export const metadata: Metadata = {
  title: "Politique de confidentialité — TontiHelm",
  description:
    "Politique de confidentialité du service TontiHelm : données traitées, finalités, durées, droits. Conforme à la loi n° 2009-09 du 22 mai 2009 (protection des données à caractère personnel, Bénin) et au Code du numérique.",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      updated="16 octobre 2026"
      intro="La présente politique décrit la manière dont YEHI OR Tech, éditeur de l'application TontiHelm, collecte, utilise, conserve et protège les données à caractère personnel transitant par le service. Elle est établie conformément à la loi n° 2009-09 du 22 mai 2009 portant organisation de la protection des données à caractère personnel en République du Bénin et au Code du numérique de la République du Bénin (loi n° 2017-20 du 26 avril 2018). TontiHelm enregistre des données financières quotidiennes : la rigueur de leur traitement n'est pas une option, c'est le cœur du service."
      sections={[
        {
          heading: "Responsable du traitement",
          paragraphs: [
            "Le responsable du traitement est la société YEHI OR Tech, établie à Parakou (République du Bénin), joignable à l'adresse contact@yehiortech.com et par WhatsApp au +229 01 41 36 08 03. Pour toute question relative aux données personnelles, ce contact est le point d'entrée unique ; il oriente vers la structure concernée ou traite directement, selon la nature de la demande.",
          ],
        },
        {
          heading: "Données collectées",
          subsections: [
            {
              heading: "Comptes de la structure (gérant, gestionnaires, agents)",
              list: [
                "Nom complet, numéro de téléphone, rôle au sein de la structure.",
                "Code PIN à six chiffres, stocké exclusivement sous forme de condensat cryptographique (scrypt) : il n'est jamais lisible, y compris par l'éditeur.",
                "Type et nom de la structure, ville, référence et justificatif d'agrément.",
              ],
            },
            {
              heading: "Cotisants enregistrés par la structure",
              list: [
                "Nom complet, numéro de téléphone (pour l'envoi des reçus), quartier de résidence, numéro de pièce d'identité le cas échéant.",
                "Données de carnet : mise journalière, longueur du cycle, date de début, encaissements jour par jour, soldes cumulés.",
                "Ces données sont saisies par les agents de la structure, qui en répondent devant leurs clients ; l'éditeur n'en vérifie pas l'exactitude mais s'interdit tout autre usage que l'exécution du service.",
              ],
            },
            {
              heading: "Demandes de démonstration",
              list: [
                "Nom complet, numéro de téléphone, nom de la structure, ville, taille approximative du portefeuille et message éventuel.",
                "Ces données servent uniquement à organiser la démonstration ; elles ne sont cédées à aucun tiers ni utilisées à des fins publicitaires.",
              ],
            },
            {
              heading: "Données techniques",
              list: [
                "Journal d'audit scellé : chaque opération (connexion, encaissement, annulation, clôture) est enregistrée avec son auteur, son horodatage et une empreinte cryptographique la reliant à la précédente, conformément aux exigences de traçabilité comptable.",
                "Stockage local du navigateur (localStorage, IndexedDB) : jeton de session, préférences d'affichage et copie hors ligne des données de la structure, pour le fonctionnement sans réseau.",
              ],
            },
          ],
        },
        {
          heading: "Finalités et bases légales",
          list: [
            "Exécution du contrat d'abonnement : fournir l'application, l'encaissement hors ligne, la synchronisation, les reçus SMS et la facturation.",
            "Consentement du cotisant : envoi des reçus et rappels par SMS ou WhatsApp, à son numéro ; ce consentement est recueilli par la structure et peut être retiré à tout moment auprès d'elle.",
            "Oblligations légales et comptables : tenue du journal d'audit inaltérable, conservation des écritures dans les délais réglementaires, réponses aux réquisitions des autorités judiciaires compétentes.",
            "Intérêt légitime : sécurité du service, prévention de la fraude, fiabilité de la synchronisation, amélioration continue dans le respect du secret des affaires.",
          ],
        },
        {
          heading: "Durées de conservation",
          paragraphs: [
            "Les données de comptes sont conservées pendant toute la durée de l'abonnement, puis quarante jours après la résiliation pour permettre les exports, avant suppression. Les écritures d'encaissement et le journal d'audit sont conservés pendant la durée exigée par la réglementation comptable et financière en vigueur au Bénin pour ce type d'opérations, la structure restant propriaire de ses exports.",
            "Les demandes de démonstration non suivies d'inscription sont supprimées au bout de douze mois. Le journal technique des connexions est conservé douze mois.",
          ],
        },
        {
          heading: "Destinataires et sous-traitants",
          paragraphs: [
            "Les données de la structure ne sont visibles que par elle-même et, pour la stricte exécution du service, par l'administration de YEHI OR Tech. Chaque structure est isolée des autres : aucun utilisateur d'une structure ne peut accéder aux données d'une autre, et l'administration n'accède aux données d'une structure que pour le support, la facturation ou la sécurité, chaque accès laissant une trace.",
            "Interviennent comme sous-traitants techniques : l'hébergeur du site et de l'application, l'hébergeur de la base de données en Europe, la passerelle d'envoi de SMS au Bénin et, pour les paiements mobile money, le prestataire de paiement agréé. Chacun ne reçoit que les données strictement nécessaires à sa prestation (numéro et corps du message pour le SMS ; identifiant de facturation et montant pour le paiement).",
          ],
        },
        {
          heading: "Sécurité",
          list: [
            "Chiffrement des communications entre le téléphone, l'application et la base de données (HTTPS/TLS).",
            "Codes PIN jamais stockés en clair, condensats résistants à la force brute.",
            "Journal d'audit à chaînage cryptographique : toute altération d'une ligne brise la chaîne et devient détectable.",
            "Isolation stricte des structures au niveau applicatif et en base, vérifiée sur chaque requête.",
            "Sauvegarde quotidienne chiffrée et restauration testée.",
          ],
          paragraphs: [
            "En cas de violation de données susceptible d'engendrer un risque pour les personnes concernées, YEHI OR Tech informe sans délai la structure cliente et notifie l'Autorité de protection des données à caractère personnel dans les conditions prévues par la loi n° 2009-09.",
          ],
        },
        {
          heading: "Vos droits",
          paragraphs: [
            "Conformément à la loi n° 2009-09 du 22 mai 2009, toute personne concernée dispose d'un droit d'accès, de rectification, d'opposition et, le cas échéant, d'effacement de ses données. Le cotisant l'exerce d'abord auprès de sa structure, qui détient la maîtrise des enregistrements le concernant ; le gérant l'exerce auprès de YEHI OR Tech à l'adresse contact@yehiortech.com, accompagné des éléments d'identification.",
            "Si la réponse obtenue ne satisfait pas la personne concernée, ou en cas de désaccord sur les conditions du traitement, une réclamation peut être adressée à l'Autorité de protection des données à caractère personnel (APDP), autorité béninoise chargée de veiller à l'application de la loi n° 2009-09.",
          ],
        },
        {
          heading: "Stockage local et traceurs",
          paragraphs: [
            "L'application n'emploie aucun traceur publicitaire ni régie tierce. Le stockage local du navigateur sert uniquement au fonctionnement du service : conserver la session ouverte, mémoriser les préférences d'affichage et permettre le mode hors ligne. Sa purge, via les réglages du navigateur, ne supprime pas les données déjà synchronisées en base ; elle déconnecte la session et retire la copie hors ligne de l'appareil.",
          ],
        },
        {
          heading: "Évolution de la politique",
          paragraphs: [
            "La présente politique peut être mise à jour pour suivre les évolutions du service ou de la réglementation. La version applicable est celle publiée en ligne, datée ; toute modification substantielle est signalée aux gérants par SMS ou courriel. L'absence de contradiction entre cette politique et les conditions générales d'utilisation est assurée par l'éditeur ; en cas de divergence, la politique la plus protectrice des personnes prévaut sur le point concerné.",
          ],
        },
      ]}
    />
  );
}
