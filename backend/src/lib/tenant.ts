// TontiHelm — helpers multi-structure : lecture seule, état d'abonnement.
import { db } from "./db";
import { ApiError } from "./auth";

export async function getSubscription(tenantId: string) {
  return db.subscription.findUnique({ where: { tenantId } });
}

/** Une structure en lecture seule (abonnement impayé > 15 jours) ne peut plus saisir d'écritures. */
export async function assertWritable(tenantId: string): Promise<void> {
  const structure = await db.structure.findUnique({ where: { id: tenantId } });
  if (!structure) throw new ApiError("not_found", "Structure introuvable.", 404);
  if (structure.status === "suspended") {
    throw new ApiError("suspended", "Ce compte est suspendu. Contacte le support TontiHelm.", 403);
  }
  const sub = await getSubscription(tenantId);
  if (sub && sub.status === "read_only") {
    throw new ApiError(
      "read_only",
      "Compte en lecture seule. Règle ton abonnement pour reprendre les encaissements.",
      403
    );
  }
}
