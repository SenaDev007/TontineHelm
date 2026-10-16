"use client";
// TontiHelm — usage courant de la structure vs quotas de son palier d'abonnement.
// Les quotas viennent de la source de vérité unique backend/src/lib/plans.ts,
// servie par GET /api/manager/billing. Les onglets Équipe et Cotisants l'affichent
// près du bouton de création : chaque limite de palier est visible AVANT d'agir.
import { useEffect, useState } from "react";
import { get } from "@/lib/client";
import { BillingData } from "@/lib/types";

export function usePlanQuota() {
  const [data, setData] = useState<{ usage: BillingData["usage"]; planLabel: string } | null>(null);
  useEffect(() => {
    get<BillingData>("/api/manager/billing")
      .then((d) =>
        setData({
          usage: d.usage,
          planLabel: d.subscription?.planLabel ?? "Démarrage",
        })
      )
      .catch(() => undefined);
  }, []);
  return data;
}
