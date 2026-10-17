// TontiHelm — définition centrale des paliers d'abonnement et de leurs quotas.
// Source de vérité unique : la page des tarifs, l'onglet Facturation et les
// contrôles à la création d'agents et de cotisants lisent TOUS ces chiffres.
export interface PlanDefinition {
  key: string;
  label: string;
  price: number; // FCFA / mois
  agents: number; // nombre maximum d'agents de collecte
  contributors: number; // nombre maximum de cotisants actifs
  reminders: boolean; // rappels automatiques aux cotisants en retard
}

export const PLANS: Record<string, PlanDefinition> = {
  demarrage: { key: "demarrage", label: "Démarrage", price: 15000, agents: 1, contributors: 50, reminders: false },
  pro: { key: "pro", label: "Pro", price: 35000, agents: 10, contributors: 300, reminders: true },
  institution: { key: "institution", label: "Institution", price: 75000, agents: 40, contributors: 3000, reminders: true },
};

export function planOf(plan: string | null | undefined): PlanDefinition {
  return PLANS[plan ?? "demarrage"] ?? PLANS.demarrage;
}
