import type { Metadata } from "next";
import { ConnexionScreen } from "@/components/tontihelm/auth/ConnexionScreen";

export const metadata: Metadata = {
  title: "Connexion — TontiHelm",
  description:
    "Connecte-toi avec ton numéro de téléphone et ton code PIN à 6 chiffres pour retrouver tes tournées, carnets et clôtures.",
};

export default function ConnexionPage() {
  return <ConnexionScreen />;
}
