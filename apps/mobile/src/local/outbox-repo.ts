// TontiHelm mobile — persistance de la file d'envoi (écart n° 7) : les rangs
// de la table `outbox` sont l'état durable de la machine @tontihelm/sync.
// Un rang part au réseau → statut in_flight (figé) ; l'accusé du serveur le
// termine (synced → supprimé, la vérité vitienne dans le miroir des écritures ;
// rejected → conservé avec son motif pour l'écran de reprise). Un crash au
// milieu d'un envoi laisse des in_flight orphelins : le moteur les remet en
// file au démarrage — le serveur tranche (création ou doublon idempotent).
import { asc, eq, inArray } from "drizzle-orm";
import type { OutboxItem, OutboxStatus } from "@tontihelm/sync";
import { openLocalDb } from "./db";
import { outbox as outboxT } from "./schema";

interface OutboxRow {
  id: string;
  payload: string;
  status: string;
  attempt: number;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
  lastError: string | null;
  ack: string | null;
}

function rowToItem(row: OutboxRow): OutboxItem {
  return {
    id: row.id,
    kind: "collection",
    payload: JSON.parse(row.payload) as OutboxItem["payload"],
    status: row.status as OutboxStatus,
    attempt: row.attempt,
    nextAttemptAt: row.nextAttemptAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastError: row.lastError ?? undefined,
    ack: row.ack ? (JSON.parse(row.ack) as OutboxItem["ack"]) : undefined,
  };
}

/** File complète, dans l'ordre de saisie (FIFO des lots). */
export async function loadOutbox(): Promise<OutboxItem[]> {
  const { db } = await openLocalDb();
  const rows = await db.select().from(outboxT).orderBy(asc(outboxT.createdAt), asc(outboxT.id));
  return rows.map(rowToItem);
}

/** Événements enregistrés hors ligne : posés dus immédiatement. */
export async function saveNewOutboxItems(items: OutboxItem[]): Promise<void> {
  if (!items.length) return;
  const { db } = await openLocalDb();
  await db.insert(outboxT).values(
    items.map((item) => ({
      id: item.id,
      payload: JSON.stringify(item.payload),
      status: item.status,
      attempt: item.attempt,
      nextAttemptAt: item.nextAttemptAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lastError: item.lastError ?? null,
      ack: item.ack ? JSON.stringify(item.ack) : null,
    }))
  );
}

/** Retour d'état de la machine : mise à jour des colonnes vives. */
export async function updateOutboxItems(items: OutboxItem[]): Promise<void> {
  if (!items.length) return;
  const { db } = await openLocalDb();
  for (const item of items) {
    await db
      .update(outboxT)
      .set({
        status: item.status,
        attempt: item.attempt,
        nextAttemptAt: item.nextAttemptAt,
        updatedAt: item.updatedAt,
        lastError: item.lastError ?? null,
        ack: item.ack ? JSON.stringify(item.ack) : null,
      })
      .where(eq(outboxT.id, item.id));
  }
}

/** Terminés (synced) : la ligne serveur vit dans le miroir — le rang part. */
export async function deleteOutboxItems(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { db } = await openLocalDb();
  await db.delete(outboxT).where(inArray(outboxT.id, ids));
}

/** Rejet relu et mis de côté par l'agent : il disparaît définitivement. */
export async function deleteOutboxItem(id: string): Promise<void> {
  const { db } = await openLocalDb();
  await db.delete(outboxT).where(eq(outboxT.id, id));
}
