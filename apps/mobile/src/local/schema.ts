// TontiHelm mobile — schéma local Drizzle (phase 2, PARITE.md §11.4) : la
// tournée et la file d'envoi vivent dans une base SQLite CHIFFRÉE (SQLCipher).
// Choix de colonnes : les objets métier arrivent déjà sérialisés par le tirage
// /v1/sync/pull (livret complet, fenêtre encaissable…) — on garde leur JSON
// exact + quelques colonnes indexées pour les listes et la file. Le livret
// n'est JAMAIS recalculé localement : le serveur reste la source de vérité,
// le téléphone en est le miroir hors ligne.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Clé/valeur : curseur de tirage, structure/agent, compteurs du dernier pull. */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * File d'envoi (écart n° 7) : un rang PAR événement, idempotent par UUID v7.
 *   status    pending | in_flight | synced | rejected (machine @tontihelm/sync)
 *   payload   JSON OutboxEvent — prêt à partir tel quel vers /v1/sync/push
 *   ack       JSON de l'accusé terminal (rejet : motif conservé pour reprise)
 */
export const outbox = sqliteTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    payload: text("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastError: text("last_error"),
    ack: text("ack"),
  },
  (t) => [index("outbox_status_due_idx").on(t.status, t.nextAttemptAt)]
);

/** Portefeuille de l'agent : cotisants (JSON exact du tirage). */
export const contributors = sqliteTable("contributors", {
  id: text("id").primaryKey(),
  json: text("json").notNull(),
});

/** Carnets : livret sérialisé complet (solde, feuilles, avance, fenêtre). */
export const passbooks = sqliteTable("passbooks", {
  passbookId: text("passbook_id").primaryKey(),
  json: text("json").notNull(),
});

/** Écritures : miroir local — les id = UUID des événements (idempotence). */
export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    passbookId: text("passbook_id").notNull(),
    collectedAt: text("collected_at").notNull(),
    json: text("json").notNull(),
  },
  (t) => [index("collections_passbook_idx").on(t.passbookId)]
);

/** Instantané du dernier tirage : curseur, résumé du jour, clôture, en-têtes. */
export const snapshot = sqliteTable("snapshot", {
  id: integer("id").primaryKey(),
  json: text("json").notNull(),
});
