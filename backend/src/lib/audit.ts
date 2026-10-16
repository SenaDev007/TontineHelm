// TontiHelm — journal d'audit : chaîne de hash scellée (chaque ligne scelle la précédente).
import { createHash } from "crypto";
import { db } from "./db";

export async function appendAudit(entry: {
  tenantId: string;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload: Record<string, unknown>;
  at?: Date;
}): Promise<void> {
  const at = entry.at ?? new Date();
  const last = await db.auditLog.findFirst({
    where: { tenantId: entry.tenantId },
    orderBy: { seq: "desc" },
  });
  const prevHash = last?.hash ?? null;
  const body = JSON.stringify({
    tenantId: entry.tenantId,
    actorId: entry.actorId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    payload: entry.payload,
    at: at.toISOString(),
  });
  const hash = createHash("sha256").update((prevHash ?? "") + body).digest("hex");
  await db.auditLog.create({
    data: {
      tenantId: entry.tenantId,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      payload: JSON.stringify(entry.payload),
      prevHash,
      hash,
      at,
    },
  });
}

/** Vérifie l'intégrité de la chaîne d'audit d'une structure. */
export async function verifyAuditChain(tenantId: string): Promise<boolean> {
  const logs = await db.auditLog.findMany({ where: { tenantId }, orderBy: { seq: "asc" } });
  let prev: string | null = null;
  for (const log of logs) {
    const body = JSON.stringify({
      tenantId: log.tenantId,
      actorId: log.actorId,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      payload: JSON.parse(log.payload),
      at: log.at.toISOString(),
    });
    const expected = createHash("sha256").update((prev ?? "") + body).digest("hex");
    if (log.prevHash !== prev || log.hash !== expected) return false;
    prev = log.hash;
  }
  return true;
}
