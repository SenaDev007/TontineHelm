import type { Metadata } from "next";
import { PublicCarnetScreen } from "@/components/tontihelm/carnet/PublicCarnetScreen";

export const metadata: Metadata = {
  title: "Mon carnet de tontine — TontiHelm",
  description:
    "Consulte ton carnet de tontine journalière : journées versées, solde cumulé, évolution du cycle — à tout moment, depuis ton lien personnel.",
  robots: { index: false, follow: false },
};

export default async function CarnetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicCarnetScreen token={token} />;
}
