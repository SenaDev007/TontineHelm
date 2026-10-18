// TontiHelm mobile — miroir local du tirage /v1/sync/pull (phase 2) : ce que
// le serveur a déjà envoyé reste lisible HORS LIGNE au prochain démarrage.
// Le magasin de tournée (zustand) s'hydrate ici avant même la première
// requête réseau ; chaque tirage réussi réécrit ce miroir (plein : remplace ;
// delta : upsert idempotent par identifiant). Les écritures PROVISOIRES de la
// file d'envoi s'y glissent avec l'UUID de leur événement : quand le serveur
// confirme, le tirage delta pose la vraie ligne au même identifiant — le
// remplacement est invisible ; quand il rejette, elle disparaît.
import { eq, inArray, notInArray, sql } from "drizzle-orm";
import type { OutboxEvent } from "@tontihelm/sync";
import { openLocalDb } from "./db";
import { collections, contributors as contributorsT, meta, outbox as outboxT, passbooks, snapshot } from "./schema";
import type { PullCollection, PullContributor, PullStop } from "@/lib/tour-store";

/** Clés du magasin clé/valeur local. */
export const META_KEYS = {
  cursor: "pull.cursor",
  lastPullAt: "pull.lastPullAt",
  tenantId: "session.tenantId",
  lastPushAt: "outbox.lastPushAt",
} as const;

export async function getMeta(key: string): Promise<string | null> {
  const { db } = await openLocalDb();
  const rows = await db.select().from(meta).where(eq(meta.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const { db } = await openLocalDb();
  await db
    .insert(meta)
    .values({ key, value })
    .onConflictDoUpdate({ target: meta.key, set: { value } });
}

export async function getMetaJson<T>(key: string): Promise<T | null> {
  const raw = await getMeta(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Instantané du dernier tirage : tout ce qui n'est ni cotisant ni carnet. */
export interface PersistedSnapshot {
  structureName: string;
  agentName: string;
  neighborhoods: string[];
  cursor: string | null;
  summary: { expectedCash: number; mobileToday: number };
  closing: { status: string; declaredCash?: number; expectedCash?: number; gap?: number } | null;
  lastSyncAt: string;
}

export async function saveSnapshot(snap: PersistedSnapshot): Promise<void> {
  const { db } = await openLocalDb();
  await db
    .insert(snapshot)
    .values({ id: 1, json: JSON.stringify(snap) })
    .onConflictDoUpdate({ target: snapshot.id, set: { json: sql`excluded.json` } });
  if (snap.cursor) await setMeta(META_KEYS.cursor, snap.cursor);
}

export async function loadSnapshot(): Promise<PersistedSnapshot | null> {
  const { db } = await openLocalDb();
  const rows = await db.select().from(snapshot).where(eq(snapshot.id, 1)).limit(1);
  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].json) as PersistedSnapshot;
  } catch {
    return null;
  }
}

// ── Cotisants ──
export async function replaceContributors(list: PullContributor[]): Promise<void> {
  const { db } = await openLocalDb();
  await db.delete(contributorsT);
  if (list.length) await db.insert(contributorsT).values(list.map((c) => ({ id: c.id, json: JSON.stringify(c) })));
}

export async function upsertContributors(list: PullContributor[]): Promise<void> {
  if (!list.length) return;
  const { db } = await openLocalDb();
  await db
    .insert(contributorsT)
    .values(list.map((c) => ({ id: c.id, json: JSON.stringify(c) })))
    .onConflictDoUpdate({ target: contributorsT.id, set: { json: sql`excluded.json` } });
}

export async function loadContributors(): Promise<PullContributor[]> {
  const { db } = await openLocalDb();
  const rows = await db.select().from(contributorsT);
  return rows.map((r) => JSON.parse(r.json) as PullContributor);
}

// ── Carnets (livret sérialisé complet) ──
export async function replacePassbooks(list: PullStop[]): Promise<void> {
  const { db } = await openLocalDb();
  await db.delete(passbooks);
  if (list.length) await db.insert(passbooks).values(list.map((p) => ({ passbookId: p.passbookId, json: JSON.stringify(p) })));
}

export async function upsertPassbooks(list: PullStop[]): Promise<void> {
  if (!list.length) return;
  const { db } = await openLocalDb();
  await db
    .insert(passbooks)
    .values(list.map((p) => ({ passbookId: p.passbookId, json: JSON.stringify(p) })))
    .onConflictDoUpdate({ target: passbooks.passbookId, set: { json: sql`excluded.json` } });
}

export async function loadPassbooks(): Promise<PullStop[]> {
  const { db } = await openLocalDb();
  const rows = await db.select().from(passbooks);
  return rows.map((r) => JSON.parse(r.json) as PullStop);
}

// ── Écritures ──
export async function upsertCollections(list: PullCollection[]): Promise<void> {
  if (!list.length) return;
  const { db } = await openLocalDb();
  await db
    .insert(collections)
    .values(
      list.map((c) => ({
        id: c.id,
        passbookId: c.passbookId,
        collectedAt: c.collectedAt,
        json: JSON.stringify(c),
      }))
    )
    .onConflictDoUpdate({
      target: collections.id,
      set: {
        passbookId: sql`excluded.passbook_id`,
        collectedAt: sql`excluded.collected_at`,
        json: sql`excluded.json`,
      },
    });
}

/**
 * Plein : remplace tout, SAUF les lignes provisoires de la file d'envoi —
 * un encaissement saisi hors ligne ne doit pas perdre son affichage « pris
 * aujourd'hui » parce que le curseur a été réinitialisé.
 */
export async function replaceCollections(list: PullCollection[]): Promise<void> {
  const { db } = await openLocalDb();
  const kept = await db
    .select({ id: outboxT.id })
    .from(outboxT)
    .where(notInArray(outboxT.status, ["synced", "rejected"]));
  const keepIds = kept.map((r) => r.id);
  if (keepIds.length) {
    await db.delete(collections).where(notInArray(collections.id, keepIds));
  } else {
    await db.delete(collections);
  }
  await upsertCollections(list);
}

export async function loadCollections(): Promise<PullCollection[]> {
  const { db } = await openLocalDb();
  const rows = await db.select().from(collections);
  return rows.map((r) => JSON.parse(r.json) as PullCollection);
}

/** Écritures provisoires : l'UUID de l'événement devient l'id de la ligne. */
export async function insertProvisionalCollections(events: OutboxEvent[]): Promise<void> {
  if (!events.length) return;
  await upsertCollections(
    events.map((ev) => ({
      id: ev.id,
      passbookId: ev.passbookId,
      amount: ev.amount,
      method: ev.method,
      collectedAt: ev.collectedAt,
    }))
  );
}

/** Un rejet définitif retire aussi sa ligne provisoire (elle n'existe pas au serveur). */
export async function deleteCollections(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { db } = await openLocalDb();
  await db.delete(collections).where(inArray(collections.id, ids));
}
