// TontiHelm — machine à états de la file d'envoi (outbox) du téléphone.
// Le brief (PARITE.md écarts n° 6/7/26) impose : un événement UUID v7 PAR ligne
// couverte (ou une écriture unique pour une avance mensuelle), idempotence par
// identifiant, accusés PAR ÉVÉNEMENT côté serveur (accepté | doublon | rejeté
// + motif), reprise 2/4/8/16 s puis 5 min, blocage après 7 jours hors ligne.
//
// Ici : uniquement les RÈGLES (pures, testées sous bun). Les entrées/sorties —
// SQLite chiffrée côté téléphone, HTTP /v1/sync/push — vivent dans les apps.
// Les statuts :
//   pending    à envoyer, `nextAttemptAt` dit quand ;
//   in_flight  parti sur le réseau, réponse pas encore revenue ;
//   synced     accusé accepté/doublon par le serveur — terminé ;
//   rejected   rejet métier DÉFINITIF (jour verrouillé, montant invalide…) :
//              conservé pour l'écran de reprise de l'agent, jamais rejoué.
import { delayForAttempt, nextAttemptAt, OFFLINE_BLOCK_MS } from "./backoff";

/** Un événement d'encaissement prêt à partir (UUID v7 du téléphone). */
export interface OutboxEvent {
  id: string;
  passbookId: string;
  amount: number;
  method: "cash" | "mobile_money";
  advance?: boolean;
  coversOn?: string | null;
  collectedAt: string;
  /** Compléments mobiles (§8.4) — l'appareil et l'horloge du téléphone. */
  deviceId?: string;
  clientTime?: string;
}

/** Accusé renvoyé par `POST /v1/sync/push` pour chaque événement (§8.2). */
export interface OutboxAck {
  status: "accepted" | "duplicate" | "rejected";
  collectionId?: string;
  reason?: { code: string; message: string };
}

export type OutboxStatus = "pending" | "in_flight" | "synced" | "rejected";

export interface OutboxItem {
  id: string;
  kind: "collection";
  payload: OutboxEvent;
  status: OutboxStatus;
  /** Échecs de transport consécutifs (réseau) — cadence la reprise. */
  attempt: number;
  /** Epoch ms — quand l'élément redevient dû (statut pending uniquement). */
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
  /** Dernière erreur de transport, pour le compte rendu à l'agent. */
  lastError?: string;
  /** Accusé terminal (synced/rejected) — motif conservé pour la reprise. */
  ack?: OutboxAck;
}

/** Nouvel événement enregistré localement : dû immédiatement. */
export function newItem(event: OutboxEvent, now: number): OutboxItem {
  return {
    id: event.id,
    kind: "collection",
    payload: event,
    status: "pending",
    attempt: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Départ sur le réseau : figé jusqu'à la réponse (ou la récupération). */
export function markInFlight(item: OutboxItem, now: number): OutboxItem {
  return { ...item, status: "in_flight", updatedAt: now, lastError: undefined };
}

/**
 * Réponse du serveur reçue : accepté/doublon → terminé ; rejeté → définitif,
 * conservé avec son motif (l'agent le relit, puis le met de côté).
 */
export function onAck(item: OutboxItem, ack: OutboxAck, now: number): OutboxItem {
  if (ack.status === "rejected") {
    return { ...item, status: "rejected", ack, updatedAt: now };
  }
  return { ...item, status: "synced", ack, attempt: 0, updatedAt: now };
}

/**
 * Le réseau a coupé (fetch échoué, 5xx, 429…) : l'élément repart en file avec
 * la cadence 2 s → 4 s → 8 s → 16 s → 5 min. Un rejet MÉTIER ne passe jamais
 * ici : il a déjà été tranché par `onAck`.
 */
export function onTransportError(item: OutboxItem, now: number, error?: string): OutboxItem {
  const attempt = item.attempt + 1;
  return {
    ...item,
    status: "pending",
    attempt,
    nextAttemptAt: nextAttemptAt(attempt, now),
    updatedAt: now,
    lastError: error,
  };
}

/**
 * Récupération de crash : un élément resté `in_flight` au redémarrage (la
 * réponse ne viendra jamais) repart en file, dû immédiatement — le serveur
 * tranche ensuite : création, ou doublon si l'écriture était déjà passée
 * (idempotence par UUID).
 */
export function recoverInFlight(item: OutboxItem, now: number): OutboxItem {
  if (item.status !== "in_flight") return item;
  return { ...item, status: "pending", nextAttemptAt: now, updatedAt: now };
}

/** Élément prêt à partir maintenant ? */
export function isDue(item: OutboxItem, now: number): boolean {
  return item.status === "pending" && item.nextAttemptAt <= now;
}

/**
 * Lot dû maintenant, dans l'ordre d'enregistrement (FIFO — un encaissement
 * saisi avant un autre part avant lui), plafonné à 50 comme le fil serveur
 * (`SyncPushSchema`). Les `rejected`/`synced` ne partent jamais.
 */
export function dueBatch(items: OutboxItem[], now: number, max = 50): OutboxItem[] {
  return items
    .filter((item) => isDue(item, now))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, max));
}

/**
 * Prochain réveil du moteur : plus proche `nextAttemptAt` des éléments en
 * attente (null si la file est vide). L'appelant plafonne lui-même le délai.
 */
export function wakeAt(items: OutboxItem[]): number | null {
  let earliest: number | null = null;
  for (const item of items) {
    if (item.status !== "pending") continue;
    if (earliest === null || item.nextAttemptAt < earliest) earliest = item.nextAttemptAt;
  }
  return earliest;
}

/** Âge de l'écriture en attente la plus ancienne (epoch ms), null si file vide. */
export function oldestPendingAgeMs(items: OutboxItem[], now: number): number | null {
  let oldest: number | null = null;
  for (const item of items) {
    if (item.status !== "pending" && item.status !== "in_flight") continue;
    const age = now - item.createdAt;
    if (oldest === null || age > oldest) oldest = age;
  }
  return oldest;
}

/**
 * Blocage des nouvelles saisies (écart n° 7) : une écriture non synchronisée
 * depuis plus de 7 jours signale un appareil durablement coupé — l'agent doit
 * resynchroniser avant de continuer (l'écart de caisse à rattraper devient
 * trop important pour l'encaisser à l'aveugle).
 */
export function isBlockedByAge(items: OutboxItem[], now: number): boolean {
  const oldest = oldestPendingAgeMs(items, now);
  return oldest !== null && oldest > OFFLINE_BLOCK_MS;
}

/** Compteurs affichés en permanence (pilule de synchronisation). */
export function counts(items: OutboxItem[]): { pending: number; inFlight: number; rejected: number } {
  let pending = 0;
  let inFlight = 0;
  let rejected = 0;
  for (const item of items) {
    if (item.status === "pending") pending += 1;
    else if (item.status === "in_flight") inFlight += 1;
    else if (item.status === "rejected") rejected += 1;
  }
  return { pending, inFlight, rejected };
}
