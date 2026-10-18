// TontiHelm — helpers multi-structure : lecture seule, état d'abonnement.
import { db } from "./db";
import { ApiError } from "./auth";
import { appendAudit } from "./audit";

export async function getSubscription(tenantId: string) {
  return db.subscription.findUnique({ where: { tenantId } });
}

// ── Bascule past_due → read_only (décision n° 6 du dirigeant, PARITE.md §8.12). ──
// 15 jours d'impayé après la fin de période : l'écriture est bloquée. La
// bascule est vérifiée AU FIL DES REQUÊTES AUTHENTIFIÉES (assertWritable, appelé
// par chaque route d'écriture) et par une passe quotidienne inspirée de
// register/cleanup (exécutée au passage sur /register/cleanup). Elle n'a lieu
// QU'UNE SEULE FOIS et laisse une trace scellée dans le journal d'audit
// (subscription_read_only). La sortie de lecture seule se fait par le règlement
// de l'abonnement (renouvellement) — la structure, elle, suit son propre cycle
// suspendu/réactivé, indépendant.
export const READ_ONLY_GRACE_DAYS = 15;

/** Retourne true si l'abonnement est en impayé de plus de 15 jours (à basculer). */
function isOverdue(sub: { status: string; periodEnd: Date | null }, now = new Date()): boolean {
  if (sub.status !== "active" && sub.status !== "past_due") return false;
  if (!sub.periodEnd) return false;
  const deadline = new Date(sub.periodEnd.getTime() + READ_ONLY_GRACE_DAYS * 24 * 60 * 60 * 1000);
  return now > deadline;
}

/**
 * Bascule l'abonnement D'UNE structure en lecture seule si l'impayé dépasse
 * 15 jours. Idempotent (au plus une fois), journalisé. Appelé avant chaque
 * écriture via assertWritable : la requête courante est alors refusée avec le
 * message de lecture seule.
 */
export async function flipOverdueSubscription(tenantId: string): Promise<boolean> {
  const sub = await db.subscription.findUnique({ where: { tenantId } });
  if (!sub || !isOverdue(sub)) return false;
  // updateMany garde la garde de statut : si une requête concurrente a déjà
  // basculé, count = 0 et rien n'est journalisé deux fois.
  const res = await db.subscription.updateMany({
    where: { tenantId, status: { in: ["active", "past_due"] } },
    data: { status: "read_only" },
  });
  if (res.count === 0) return false;
  await appendAudit({
    tenantId,
    actorId: null,
    action: "subscription_read_only",
    entity: "subscription",
    entityId: sub.id,
    payload: {
      plan: sub.plan,
      periodEnd: sub.periodEnd?.toISOString().slice(0, 10) ?? null,
      daysLate: READ_ONLY_GRACE_DAYS,
    },
  });
  return true;
}

/**
 * Passe quotidienne (inspirée de register/cleanup, sans cron) : bascule TOUTES
 * les structures en impayé de plus de 15 jours. Retourne le nombre de bascules.
 */
export async function flipOverdueSubscriptions(): Promise<number> {
  const deadline = new Date(Date.now() - READ_ONLY_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const subs = await db.subscription.findMany({
    where: { status: { in: ["active", "past_due"] }, periodEnd: { lt: deadline } },
    select: { tenantId: true },
  });
  let flipped = 0;
  for (const s of subs) {
    if (await flipOverdueSubscription(s.tenantId)) flipped += 1;
  }
  return flipped;
}

/** Une structure en lecture seule (abonnement impayé > 15 jours) ne peut plus saisir d'écritures. */
export async function assertWritable(tenantId: string): Promise<void> {
  const structure = await db.structure.findUnique({ where: { id: tenantId } });
  if (!structure) throw new ApiError("not_found", "Structure introuvable.", 404);
  if (structure.status === "suspended") {
    throw new ApiError("suspended", "Ce compte est suspendu. Contacte le support TontiHelm.", 403);
  }
  // Vérification au fil des requêtes (§8.12) : la bascule éventuelle a lieu ici,
  // PUIS le blocage s'applique — à 15 jours d'impayé, l'écriture est refusée.
  await flipOverdueSubscription(tenantId);
  const sub = await getSubscription(tenantId);
  if (sub && sub.status === "read_only") {
    throw new ApiError(
      "read_only",
      "Compte en lecture seule. Règle ton abonnement pour reprendre les encaissements.",
      403
    );
  }
}
