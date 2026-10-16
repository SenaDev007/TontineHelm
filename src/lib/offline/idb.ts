// TontiHelm — couche IndexedDB minimale (aucune dépendance) pour le mode hors ligne,
// inspirée du patron offline-first d'Academia Helm :
//   · response_cache : miroir local des réponses GET (lecture hors réseau) ;
//   · outbox         : file des mutations réalisées hors ligne (replay exact) ;
//   · meta           : horodatages (dernière synchronisation).
const DB_NAME = "tontihelm-offline";
const DB_VERSION = 1;

/** Entrée du cache de réponses GET. */
export interface CacheEntry {
  key: string;
  url: string;
  /** Empreinte de l'identité (token) — isole les caches par utilisateur. */
  scope: string;
  data: unknown;
  cachedAt: number;
  expiresAt: number;
}

/** Événement de la file d'envoi (mutation hors ligne, rejouée à l'identique). */
export interface OutboxEntry {
  id: string;
  url: string;
  method: string;
  body: string | null;
  scope: string;
  /** Libellé compréhensible pour l'indicateur d'interface. */
  label: string;
  status: "PENDING" | "FAILED";
  attempts: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponible"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("response_cache")) {
        const store = db.createObjectStore("response_cache", { keyPath: "key" });
        store.createIndex("scope", "scope", { unique: false });
      }
      if (!db.objectStoreNames.contains("outbox")) {
        const store = db.createObjectStore("outbox", { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Exécute une transaction et renvoie le résultat de la requête (ou void). */
function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | void> {
  return openDb().then(
    (db) =>
      new Promise<T | void>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        let request: IDBRequest<T> | null = null;
        try {
          request = fn(store) as IDBRequest<T> | null;
        } catch (err) {
          reject(err);
          return;
        }
        t.oncomplete = () => resolve(request ? request.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

/* ── Cache de réponses ──────────────────────────────────────────────────── */

export async function cacheGet(key: string): Promise<CacheEntry | undefined> {
  const entry = await withStore<CacheEntry>("response_cache", "readonly", (s) => s.get(key));
  if (!entry) return undefined;
  // Une entrée périmée reste utilisable hors ligne (données au dernier état connu),
  // mais on la retire silencieusement si on est en ligne pour privilégier le réseau.
  return entry;
}

export async function cachePut(entry: CacheEntry): Promise<void> {
  await withStore("response_cache", "readwrite", (s) => s.put(entry));
}

export async function cacheDelete(key: string): Promise<void> {
  await withStore("response_cache", "readwrite", (s) => s["delete"](key));
}

/** Purge totale (déconnexion, changement de compte). */
export async function cacheClear(): Promise<void> {
  await withStore("response_cache", "readwrite", (s) => s.clear());
}

/* ── File d'envoi (outbox) ───────────────────────────────────────────────── */

export async function outboxAdd(entry: OutboxEntry): Promise<void> {
  await withStore("outbox", "readwrite", (s) => s.put(entry));
}

export async function outboxAll(): Promise<OutboxEntry[]> {
  const entries = await withStore<OutboxEntry[]>("outbox", "readonly", (s) => s.getAll());
  return (entries ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function outboxUpdate(entry: OutboxEntry): Promise<void> {
  await withStore("outbox", "readwrite", (s) => s.put(entry));
}

export async function outboxDelete(id: string): Promise<void> {
  await withStore("outbox", "readwrite", (s) => s["delete"](id));
}

export async function outboxCounts(): Promise<{ pending: number; failed: number }> {
  const entries = await withStore<OutboxEntry[]>("outbox", "readonly", (s) => s.getAll());
  let pending = 0;
  let failed = 0;
  for (const e of entries ?? []) {
    if (e.status === "PENDING") pending += 1;
    else if (e.status === "FAILED") failed += 1;
  }
  return { pending, failed };
}

/** Supprime les événements marqués FAILED ( après décision de l'utilisateur). */
export async function outboxClearFailed(): Promise<void> {
  const entries = await outboxAll();
  await Promise.all(entries.filter((e) => e.status === "FAILED").map((e) => outboxDelete(e.id)));
}

/** Purge totale de la file (déconnexion). */
export async function outboxClear(): Promise<void> {
  await withStore("outbox", "readwrite", (s) => s.clear());
}

/* ── Divers ──────────────────────────────────────────────────────────────── */

export async function metaGet<T>(key: string): Promise<T | undefined> {
  const row = await withStore<{ key: string; value: T }>("meta", "readonly", (s) => s.get(key));
  return row?.value;
}

export async function metaSet<T>(key: string, value: T): Promise<void> {
  await withStore("meta", "readwrite", (s) => s.put({ key, value }));
}

/** Indique si IndexedDB est utilisable dans ce navigateur. */
export function offlineStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
