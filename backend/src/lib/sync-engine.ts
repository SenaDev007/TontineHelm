// TontiHelm — moteur d'application d'un événement d'encaissement (phase 1).
// Extraits À L'IDENTIQUE du cœur de POST /api/agent/sync : ce fichier est la
// source unique partagée par le canal web (/api/agent/sync, comportement
// inchangé, l'erreur métier fait échouer le lot en HTTP) et le canal mobile
// (/v1/sync/push, accusé PAR ÉVÉNEMENT — PARITE.md §8.2 : accepté | doublon |
// rejeté + motif). Les gardes de clôture validée restent dans CHAQUE route :
// le web conserve sa garde de lot (journée du jour), le mobile applique la
// règle par événement (la journée couverte par l'événement — écart n° 3 :
// les événements datés d'un autre jour que la clôture ne sont pas bloqués).
import { db } from "./db";
import { ApiError } from "./auth";
import { appendAudit } from "./audit";
import { publishTenantEvent } from "./events";
import { passbookBalance, paidDays } from "./domain";
import {
  buildLivret, clampCycleDays, firstPayableLine, monthStart, sheetsForCycleDays,
} from "./livret";

/** Entrée d'un événement — compatible avec les schémas /api ET /v1 (packages/schemas). */
export interface SyncEventInput {
  id: string;
  passbookId: string;
  amount: number;
  method: "cash" | "mobile_money";
  advance?: boolean;
  coversOn?: string | null;
  collectedAt: string;
}

export interface ApplyEventResult {
  id: string;
  status: "created" | "duplicate";
  collectionId: string;
}

/**
 * Applique UN événement d'encaissement : écriture idempotente (UUID), ligne du
 * livret séquentielle, journal d'audit chaîné. Lève ApiError en cas de rejet
 * métier (bad_state, day_out_of_cycle, amount_exceeds, invalid_input) — au
 * canal appelant de décider si l'erreur fait échouer le lot (web) ou nourrit
 * l'accusé de l'événement (mobile).
 */
export async function applyCollectionEvent(opts: {
  tenantId: string;
  agentId: string;
  ev: SyncEventInput;
  /** "sync" (web, libellé d'audit historique) ou "sync_v1" (mobile). */
  source: string;
  /** Compléments du canal mobile uniquement (§8.4/§8.6) : deviceId, clockSkewMs. */
  extraPayload?: Record<string, unknown>;
}): Promise<ApplyEventResult> {
  const { tenantId, agentId, ev, source } = opts;
  const existing = await db.collection.findUnique({ where: { id: ev.id } });
  if (existing) {
    return { id: ev.id, status: "duplicate", collectionId: existing.id };
  }
  const passbook = await db.passbook.findUnique({
    where: { id: ev.passbookId },
    include: { contributor: true, collections: true },
  });
  // Comportement web conservé : un carnet hors périmètre (inconnu, autre
  // structure ou autre agent) est accusé « doublon » — jamais divulgué.
  if (!passbook || passbook.tenantId !== tenantId || passbook.agentId !== agentId) {
    return { id: ev.id, status: "duplicate", collectionId: ev.id };
  }
  if (passbook.status !== "active" && passbook.status !== "late") {
    throw new ApiError(
      "bad_state",
      passbook.status === "closing" || passbook.status === "completed"
        ? "Ce carnet est clôturé (remise en cours ou déjà signé) : plus aucun encaissement."
        : "Ce carnet n'est plus actif.",
      409
    );
  }
  // Journée couverte (legacy) : elle doit tomber dans les feuilles du livret
  // (durée du cycle §8.14 — 372 par défaut, moins en cycle court).
  let coversOn: Date | null = null;
  if (ev.coversOn) {
    coversOn = new Date(`${ev.coversOn}T00:00:00.000Z`);
    if (Number.isNaN(coversOn.getTime())) {
      throw new ApiError("invalid_input", "Journée couverte invalide.");
    }
    const cycleDays = clampCycleDays(passbook.cycleDays);
    const livretStart = monthStart(passbook.startsOn);
    const livretEnd = new Date(livretStart);
    livretEnd.setUTCMonth(livretEnd.getUTCMonth() + sheetsForCycleDays(cycleDays));
    if (coversOn < livretStart || coversOn >= livretEnd) {
      throw new ApiError(
        "day_out_of_cycle",
        "Cette journée est hors du livret annuel (12 feuilles mensuelles).",
        422
      );
    }
  }
  // Règle métier 2 : un encaissement ne dépasse jamais le montant restant du
  // livret (lignes encaissables, hors lignes excusées d'avant l'arrivée), sauf
  // avance explicite pour laisser le surplus en dépôt.
  const balance = passbookBalance(passbook.collections);
  const livretBefore = buildLivret(passbook, balance);
  const cycleTotal = livretBefore.recap.attendu;
  if (!ev.advance && ev.amount > cycleTotal - balance) {
    throw new ApiError(
      "amount_exceeds",
      "Encaissement supérieur au montant restant du livret. Marque-le comme paiement d'avance ou corrige le montant.",
      422
    );
  }
  // Ligne du livret : position séquentielle après pose de l'écriture. Les
  // lignes d'avant l'arrivée du cotisant sont excusées : la numérotation
  // démarre à sa première ligne encaissable. Bornée par la durée du cycle.
  const dayIndex = Math.min(
    firstPayableLine(passbook) + paidDays(balance + ev.amount, passbook.dailyAmount) - 1,
    clampCycleDays(passbook.cycleDays)
  );
  const collectedAt = new Date(ev.collectedAt);

  await db.collection.create({
    data: {
      id: ev.id,
      tenantId,
      passbookId: passbook.id,
      agentId,
      amount: ev.amount,
      method: ev.method,
      dayIndex,
      coversOn,
      collectedAt,
      receivedAt: new Date(),
    },
  });

  await appendAudit({
    tenantId,
    actorId: agentId,
    action: "collection",
    entity: "collection",
    entityId: ev.id,
    payload: {
      passbook: passbook.number,
      contributor: passbook.contributor.fullName,
      amount: ev.amount,
      method: ev.method,
      line: dayIndex,
      coversOn: ev.coversOn ?? null,
      advance: ev.advance,
      source,
      ...(opts.extraPayload ?? {}),
    },
    at: new Date(),
  });

  // Le carnet du cotisant est la source de vérité : chaque écriture y est
  // visible immédiatement depuis son lien personnel (WhatsApp / e-mail).

  // Temps réel web ↔ mobile (décision du dirigeant, 2026-10-18) : l'écriture
  // est publiée aux flux SSE de la structure — même point d'émission pour les
  // DEUX canaux (web /api/agent/sync et mobile /v1/sync/push), donc tout ce
  // qui est fait d'un côté est vu de l'autre dès la milliseconde.
  publishTenantEvent({
    type: "collection",
    tenantId,
    at: new Date().toISOString(),
    passbookId: passbook.id,
    contributorId: passbook.contributorId,
    agentId,
    amount: ev.amount,
    source,
  });

  return { id: ev.id, status: "created", collectionId: ev.id };
}
