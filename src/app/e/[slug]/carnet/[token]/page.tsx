"use client";
// TontiHelm — carnet public d'un client, rattaché au lien dédié de SON entité :
// /e/{slug}/carnet/{token}. Le cotisant voit le nom de sa structure et son
// livret annuel (12 feuilles + récap) ; c'est aussi ici qu'il signe la fin de
// sa souscription. L'ancienne adresse /carnet/{token} reste valable.
import { useEffect, useState } from "react";
import { PublicCarnetScreen } from "@/components/tontihelm/carnet/PublicCarnetScreen";

export default function EntityCarnetPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    void params.then((p) => setToken(p.token));
  }, [params]);
  if (!token) return null;
  return <PublicCarnetScreen token={token} />;
}
