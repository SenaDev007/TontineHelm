import type { Metadata } from "next";
import { InscriptionScreen } from "@/components/tontihelm/register/InscriptionScreen";

export const metadata: Metadata = {
  title: "Inscrire ma structure — TontiHelm",
  description:
    "Inscris ta structure de tontine en quelques minutes : identité, dirigeant et code PIN. L'espace est activé après vérification sous 24 heures ouvrées.",
};

export default function InscriptionPage() {
  return <InscriptionScreen />;
}
