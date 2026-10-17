// TontiHelm — montée en charge automatique des paliers (2026-10).
// Le système est intelligent : il surveille le nombre de cotisants actifs, le
// nombre d'agents et l'argent encaissé (30 jours glissants). À l'approche des
// quotas du palier courant, il alerte les dirigeants (« tu vas scaler ») ; au
// dépassement, il bascule AUTOMATIQUEMENT le palier supérieur et le leur
// confirme (« le plan a switché ») via un événement de palier visible dans
// l'espace dirigeant (cloche d'alertes + Facturation).
import { db } from "./db";
import { planOf, PLANS } from "./plans";
import { formatFCFA } from "./domain";
import { appendAudit } from "./audit";

export const PLAN_ORDER = ["demarrage", "pro", "institution"] as const;

// Volume encaissé sur 30 jours glissants qui déclenche la montée de palier
// (l'argent suit l'activité : 300 clients à 500 FCFA/j ≈ 4,5 M/mois).
export const VOLUME_THRESHOLDS: { plan: string; fcfa: number }[] = [
  { plan: "pro", fcfa: 2_000_000 },
  { plan: "institution", fcfa: 20_000_000 },
];

export interface UsageSnapshot {
  plan: string;
  planLabel: string;
  contributors: number;
  agents: number;
  volumeMonth: number; // FCFA encaissés sur 30 jours glissants
}

/** Photo de l'usage courant de la structure. */
export async function usageSnapshot(tenantId: string): Promise<UsageSnapshot> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [sub, contributors, agents, volumeAgg] = await Promise.all([
    db.subscription.findUnique({ where: { tenantId }, select: { plan: true } }),
    db.contributor.count({ where: { tenantId, status: "active" } }),
    db.user.count({ where: { tenantId, role: "agent", status: "active" } }),
    db.collection.aggregate({
      where: { tenantId, collectedAt: { gte: since } },
      _sum: { amount: true },
    }),
  ]);
  const plan = sub?.plan ?? "demarrage";
  return {
    plan,
    planLabel: planOf(plan).label,
    contributors,
    agents,
    volumeMonth: Math.max(0, volumeAgg._sum.amount ?? 0),
  };
}

/** Palier requis par un niveau d'usage (cotisants, agents, volume). */
export function requiredPlanFor(usage: { contributors: number; agents: number; volumeMonth: number }): string {
  let required = "demarrage";
  for (const [key, def] of Object.entries(PLANS)) {
    if (usage.contributors <= def.contributors && usage.agents <= def.agents) {
      required = key;
      break;
    }
    required = "institution";
  }
  // L'argent fait monter le palier tout seul (volume encaissé sur 30 jours).
  for (const t of VOLUME_THRESHOLDS) {
    if (usage.volumeMonth >= t.fcfa) required = higherOf(required, t.plan);
  }
  return required;
}

function higherOf(a: string, b: string): string {
  return rank(b) > rank(a) ? b : a;
}

function rank(plan: string): number {
  const i = (PLAN_ORDER as readonly string[]).indexOf(plan);
  return i < 0 ? 0 : i;
}

export interface ScaleResult {
  snapshot: UsageSnapshot;
  requiredPlan: string;
  upgraded: boolean;
  fromPlan: string | null;
  toPlan: string;
  warningCreated: boolean;
}

/**
 * Vérifie et applique la montée en charge :
 *  - dépassement (avec marge `extraContributors`/`extraAgents` projetée) →
 *    bascule automatique du palier supérieur + accusé aux dirigeants ;
 *  - approche des quotas (≥ 80 %) → alerte « tu vas scaler » (au plus une
 *    tous les 7 jours) ;
 *  - retourne la photo d'usage pour l'appelant (dashboard, facturation).
 */
export async function autoScale(
  tenantId: string,
  opts: { extraContributors?: number; extraAgents?: number; actorId?: string } = {}
): Promise<ScaleResult> {
  const snapshot = await usageSnapshot(tenantId);
  const projected = {
    contributors: snapshot.contributors + (opts.extraContributors ?? 0),
    agents: snapshot.agents + (opts.extraAgents ?? 0),
    volumeMonth: snapshot.volumeMonth,
  };
  const required = requiredPlanFor(projected);
  const current = snapshot.plan;

  let upgraded = false;
  let fromPlan: string | null = null;
  let warningCreated = false;

  if (rank(required) > rank(current)) {
    // ── Le système scale tout seul : palier supérieur activé automatiquement. ──
    fromPlan = current;
    const nextDef = planOf(required);
    await db.subscription.updateMany({ where: { tenantId }, data: { plan: required } });
    await db.planEvent.create({
      data: {
        tenantId,
        kind: "plan_upgraded",
        fromPlan: current,
        toPlan: required,
        contributors: snapshot.contributors,
        agents: snapshot.agents,
        volumeMonth: snapshot.volumeMonth,
        message:
          `Montée en charge automatique : ton activité (${snapshot.contributors} cotisants actifs, ` +
          `${snapshot.agents} agents, ${formatFCFA(snapshot.volumeMonth)} encaissés sur 30 jours) a dépassé les ` +
          `limites du palier ${planOf(current).label}. Ton abonnement est passé d'office au palier ` +
          `${nextDef.label} (${formatFCFA(nextDef.price)}/mois, ${nextDef.contributors} cotisants, ${nextDef.agents} agents) — ` +
          `continue sans interruption, la facturation suit au prochain cycle.`,
      },
    });
    await appendAudit({
      tenantId,
      actorId: opts.actorId ?? null,
      action: "plan_auto_upgraded",
      entity: "subscription",
      entityId: tenantId,
      payload: { fromPlan: current, toPlan: required, contributors: snapshot.contributors, agents: snapshot.agents, volumeMonth: snapshot.volumeMonth },
    });
    upgraded = true;
    snapshot.plan = required;
    snapshot.planLabel = nextDef.label;
  } else if (rank(required) === rank(current) && current !== "institution") {
    // ── Approche des quotas : « tu vas scaler », prépare-toi. ──
    const def = planOf(current);
    const nearContributors = projected.contributors >= Math.ceil(def.contributors * 0.8);
    const nearAgents = projected.agents >= Math.ceil(def.agents * 0.8);
    const nearVolume = VOLUME_THRESHOLDS.some(
      (t) => rank(t.plan) === rank(current) + 1 && snapshot.volumeMonth >= Math.ceil(t.fcfa * 0.8)
    );
    if (nearContributors || nearAgents || nearVolume) {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recent = await db.planEvent.findFirst({
        where: { tenantId, kind: "scaling_warning", createdAt: { gte: weekAgo } },
        select: { id: true },
      });
      if (!recent) {
        await db.planEvent.create({
          data: {
            tenantId,
            kind: "scaling_warning",
            fromPlan: current,
            toPlan: higherOf(current, "institution"),
            contributors: snapshot.contributors,
            agents: snapshot.agents,
            volumeMonth: snapshot.volumeMonth,
            message:
              `Tu approches des limites du palier ${def.label} : ${snapshot.contributors}/${def.contributors} cotisants actifs, ` +
              `${snapshot.agents}/${def.agents} agents, ${formatFCFA(snapshot.volumeMonth)} encaissés sur 30 jours. ` +
              `Tu vas scaler — le passage au palier supérieur se fera automatiquement dès le dépassement, ` +
              `sans interruption de service.`,
          },
        });
        warningCreated = true;
      }
    }
  }

  return { snapshot, requiredPlan: snapshot.plan, upgraded, fromPlan, toPlan: snapshot.plan, warningCreated };
}

/** Derniers événements de palier (alertes dirigeants), plus récents d'abord. */
export async function recentPlanEvents(tenantId: string, limit = 20) {
  const events = await db.planEvent.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return {
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      fromPlan: e.fromPlan,
      toPlan: e.toPlan,
      message: e.message,
      contributors: e.contributors,
      agents: e.agents,
      volumeMonth: e.volumeMonth,
      readAt: e.readAt,
      createdAt: e.createdAt,
    })),
    unread: events.filter((e) => !e.readAt).length,
  };
}

/** Marque toutes les alertes de palier comme lues. */
export async function markPlanEventsRead(tenantId: string): Promise<number> {
  const res = await db.planEvent.updateMany({
    where: { tenantId, readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}
