// TontiHelm — moteur de synchronisation offline-first (patron Academia Helm, adapté) :
//   · déclencheurs : retour du réseau (anti-rebond 1,5 s), chargement de page,
//     cycle de 30 s tant qu'il reste des événements, appel manuel ;
//   · flush : replay EXACT de chaque mutation vers son endpoint d'origine (FIFO) ;
//   · sémantique d'erreur honnête : 4xx = refus métier définitif (FAILED conservé),
//     5xx / réseau = transitoire (PENDING, backoff exponentiel avec gigue).
import { apiUrl, getToken } from "@/lib/client";
import { metaGet, metaSet, outboxAll, outboxDelete, outboxUpdate, type OutboxEntry } from "./idb";

const BACKOFF_STEPS = [2000, 5000, 15000, 45000, 60000];
const MUTATION_TIMEOUT = 20000;

export type SyncResult = { synced: number; failed: number; remaining: number };

let flushing = false;
let onlineListenerBound = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;
let backoffIndex = 0;

function dispatch(name: string, detail?: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** Rejoue une mutation exactement comme à l'origine (même URL, verbe, corps, en-têtes). */
async function replay(event: OutboxEntry): Promise<Response> {
  const token = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MUTATION_TIMEOUT);
  try {
    return await fetch(apiUrl(event.url), {
      method: event.method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-Offline-Replay": "1",
      },
      body: event.body ?? undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } } | null;
    return data?.error?.message ?? `Refus du serveur (HTTP ${res.status}).`;
  } catch {
    return `Refus du serveur (HTTP ${res.status}).`;
  }
}

/** Vide la file d'envoi : renvoie le décompte de la passe. Idempotent (mutex). */
export async function flushOutbox(): Promise<SyncResult> {
  if (flushing || !isOnline()) return { synced: 0, failed: 0, remaining: 0 };
  flushing = true;
  cancelBackoff();
  dispatch("tontihelm:sync-start");
  let synced = 0;
  let failed = 0;
  try {
    const entries = (await outboxAll()).filter((e) => e.status === "PENDING");
    for (const event of entries) {
      try {
        const res = await replay(event);
        if (res.ok) {
          await outboxDelete(event.id);
          synced += 1;
          dispatch("tontihelm:outbox-changed");
        } else if (res.status >= 400 && res.status < 500) {
          // Refus métier définitif : conservé pour l'affichage, jamais rejoué.
          const message = await readErrorMessage(res);
          await outboxUpdate({
            ...event,
            status: "FAILED",
            attempts: event.attempts + 1,
            lastError: message,
            updatedAt: Date.now(),
          });
          failed += 1;
          dispatch("tontihelm:outbox-changed");
        } else {
          // 5xx : panne du serveur — transitoire, on arrête le lot et on réessaaye plus tard.
          throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        // Réseau coupé pendant le flush : transitoire. Backoff puis reprise.
        scheduleBackoff();
        break;
      }
    }
    if (synced > 0) await metaSet("lastSyncAt", Date.now());
    return finish(synced, failed);
  } finally {
    flushing = false;
  }
}

function finish(synced: number, failed: number): Promise<SyncResult> {
  return outboxAll().then((entries) => {
    const remaining = entries.filter((e) => e.status === "PENDING").length;
    dispatch("tontihelm:sync-done", { synced, failed, remaining });
    return { synced, failed, remaining };
  });
}

function scheduleBackoff() {
  if (backoffTimer) return;
  const delay = BACKOFF_STEPS[Math.min(backoffIndex, BACKOFF_STEPS.length - 1)];
  const jitter = delay * (0.8 + Math.random() * 0.4); // ±20 %
  backoffIndex = Math.min(backoffIndex + 1, BACKOFF_STEPS.length - 1);
  backoffTimer = setTimeout(() => {
    backoffTimer = null;
    void flushOutbox();
  }, jitter);
}

function cancelBackoff() {
  if (backoffTimer) {
    clearTimeout(backoffTimer);
    backoffTimer = null;
  }
  backoffIndex = 0;
}

/**
 * Branche les déclencheurs de synchronisation : au retour du réseau (avec
 * anti-rebond de 1,5 s contre les interfaces qui « flappent »), au chargement,
 * puis toutes les 30 secondes tant qu'il reste des événements en attente.
 */
export function initOfflineSync(): void {
  if (typeof window === "undefined" || onlineListenerBound) return;
  onlineListenerBound = true;

  window.addEventListener("online", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void flushOutbox();
    }, 1500);
  });

  window.addEventListener("offline", cancelBackoff);

  // Au chargement : repartir la file si on est déjà en ligne.
  if (isOnline()) {
    setTimeout(() => void flushOutbox(), 2000);
  }

  // Cycle permanent : push express tant qu'il reste du monde en file.
  window.setInterval(
    () => {
      if (isOnline()) void flushOutbox();
    },
    30_000
  );
}

/** Dernière synchronisation réussie (horodatage, ou null). */
export async function getLastSync(): Promise<number | null> {
  return (await metaGet<number>("lastSyncAt")) ?? null;
}
