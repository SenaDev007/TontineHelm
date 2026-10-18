// TontiHelm mobile — base locale CHIFFRÉE (phase 2, écarts n° 7/26 du PARITE) :
// SQLCipher compilé dans l'application (plugin expo-sqlite « useSQLCipher »,
// build de développement obligatoire — pas d'Expo Go pour le chiffrement),
// clé aléatoire de 32 octets née sur l'appareil et gardée dans le coffre
// sécurisé (expo-secure-store, jamais écrite dans la base ni envoyée au
// serveur). Drizzle (drizzle-orm/expo-sqlite) porte les requêtes du miroir
// hors ligne ; les migrations sont des CREATE TABLE IF NOT EXISTS simples —
// un cache téléchargeable ne justifie pas drizzle-kit.
import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";

const DB_NAME = "tontinehelm.db";
const KEY_ALIAS = "th.mobile.dbkey";

/** Clé de chiffrement : 32 octets aléatoires, hexadécimal, nés une fois. */
async function ensureKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_ALIAS).catch(() => null);
  if (existing) return existing;
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await SecureStore.setItemAsync(KEY_ALIAS, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT,
  ack TEXT
);
CREATE INDEX IF NOT EXISTS outbox_status_due_idx ON outbox (status, next_attempt_at);
CREATE TABLE IF NOT EXISTS contributors (
  id TEXT PRIMARY KEY NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS passbooks (
  passbook_id TEXT PRIMARY KEY NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY NOT NULL,
  passbook_id TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS collections_passbook_idx ON collections (passbook_id);
CREATE TABLE IF NOT EXISTS snapshot (
  id INTEGER PRIMARY KEY NOT NULL,
  json TEXT NOT NULL
);
`;

export interface LocalDb {
  /** Base expo-sqlite brute (PRAGMA, transactions, SQL ad hoc). */
  raw: SQLite.SQLiteDatabase;
  /** Drizzle par-dessus : requêtes typées du miroir hors ligne. */
  db: ExpoSQLiteDatabase<typeof schema>;
}

let state: LocalDb | null = null;

async function openWithKey(key: string): Promise<SQLite.SQLiteDatabase> {
  const raw = SQLite.openDatabaseSync(DB_NAME);
  // SQLCipher : la clé se pose AVANT toute autre instruction sur la connexion
  // (base neuve : elle chiffre ce qui sera écrit ; base existante : elle la
  // déchiffre — une clé erronée explose à la première lecture, ci-dessous).
  await raw.execAsync(`PRAGMA key = '${key}';`);
  await raw.execAsync(MIGRATIONS);
  return raw;
}

/**
 * Ouvre (une seule fois) la base chiffrée de l'appareil. Si le coffre a été
 * effacé alors que le fichier persiste (réinstallation partielle, clé perdue),
 * la base est indéchiffrable par construction : on repart d'un fichier neuf —
 * tout est re-téléchargeable par un tirage complet, seule la file non partie
 * serait perdue (elle n'a JAMAIS quitté l'appareil, le serveur ne la connaît
 * pas : c'est le compromis du chiffrement au repos, accepté par conception).
 */
export async function openLocalDb(): Promise<LocalDb> {
  if (state) return state;
  const key = await ensureKey();
  let raw: SQLite.SQLiteDatabase;
  try {
    raw = await openWithKey(key);
  } catch {
    try {
      SQLite.deleteDatabaseSync?.(DB_NAME);
    } catch {
      /* fichier absent ou déjà fermé */
    }
    raw = await openWithKey(key);
  }
  state = { raw, db: drizzle(raw, { schema }) };
  return state;
}

/** Base déjà ouverte ? (évite d'ouvrir pour rien au purging de session.) */
export function localDbOrNull(): LocalDb | null {
  return state;
}

/**
 * Purge des données locales (déconnexion, révocation d'appareil, changement
 * de structure — PARITE §8.5) : le FICHIER chiffré reste (la clé avec lui),
 * son CONTENU disparaît — un prochain login repart d'un tirage complet.
 * No-op si la base n'a jamais été ouverte : rien n'a été écrit, rien à purger.
 */
export async function wipeLocalData(): Promise<void> {
  const opened = state;
  if (!opened) return;
  await opened.db.delete(schema.outbox);
  await opened.db.delete(schema.contributors);
  await opened.db.delete(schema.passbooks);
  await opened.db.delete(schema.collections);
  await opened.db.delete(schema.snapshot);
  await opened.db.delete(schema.meta);
}
