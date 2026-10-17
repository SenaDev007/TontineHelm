import type { Metadata } from "next";
import { LivretDetailScreen } from "@/components/tontihelm/carnet/LivretDetailScreen";

export const metadata: Metadata = {
  title: "Livret annuel — TontiHelm",
  description:
    "Livret annuel du carnet : 12 feuilles mensuelles avec avance et reste, récapitulatif, écritures et fin de souscription.",
  robots: { index: false, follow: false },
};

export default async function LivretPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LivretDetailScreen passbookId={id} />;
}
