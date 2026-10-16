"use client";
// TontiHelm — client API côté navigateur : erreurs au format unique (code + message français).
// Deux modes d'adressage :
//   · production : NEXT_PUBLIC_API_URL pointe vers l'API Railway (domains Vercel ↔ Railway distincts) ;
//   · préproduction sandbox : requêtes relatives via la passerelle, port du backend
//     transmis par le paramètre XTransformPort.
// Authentification : jeton de session en en-tête Authorization Bearer (fonctionne sur
// tous les domaines), cookie httpOnly conservé en renfort.
//
// Couche offline-first (patron Academia Helm, adapté) :
//   · GET  : réseau d'abord, écriture dans le cache IndexedDB ; panne réseau →
//           réponse servie depuis le cache (dernier état connu) ;
//   · mutations : réseau d'abord (20 s) ; panne réseau → mise en file (outbox)
//           et réponse fabriquée { __offlineQueued: true } — l'interface continue,
//           le moteur de synchronisation rejoue la requête au retour du réseau.
import { cacheClear, cacheGet, cachePut, outboxAdd, outboxClear, type OutboxEntry } from "./offline/idb";

const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? "3001";
const TOKEN_KEY = "tontihelm_token";

/** Marqueur des réponses fabriquées pour une mutation mise en file hors ligne. */
export const OFFLINE_QUEUED = "__offlineQueued";

/** Type garde : la réponse est-elle un accusé de mise en file hors ligne ? */
export function isOfflineQueued<T>(res: T | { __offlineQueued: true }): res is { __offlineQueued: true } {
  return typeof res === "object" && res !== null && (res as Record<string, unknown>)[OFFLINE_QUEUED] === true;
}

export class ApiClientError extends Error {
  code: string;
  constructor(message: string, code = "error") {
    super(message);
    this.code = code;
  }
}

/** Construit l'URL complète d'un appel API selon l'environnement. */
export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (base) return `${base.replace(/\/$/, "")}${path}`;
  return `${path}${path.includes("?") ? "&" : "?"}XTransformPort=${API_PORT}`;
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

/* ── Routes jamais mises en file hors ligne ─────────────────────────────────
 * auth        : la session doit exister côté serveur avant tout ;
 * agent/sync  : c'est elle-même le mécanisme de vidage de l'outbox agent ;
 * register    : pièce justificative lourde, validation métier immédiate ;
 * payments    : un lien de paiement doit être créé en ligne réelle. */
const NEVER_QUEUE = [
  /^\/api\/auth\//,
  /^\/api\/agent\/sync/,
  /^\/api\/structures\/register/,
  /^\/api\/payments\//,
];

/** Durée de fraîcheur du cache GET (hors ligne, une entrée périmée reste servie). */
const CACHE_TTL = 5 * 60 * 1000;

function cacheScope(): string {
  const token = getToken();
  // Empreinte courte du token : isole les caches par utilisateur connecté.
  let hash = 0;
  for (let i = 0; i < (token?.length ?? 0); i += 1) {
    hash = (hash * 31 + (token?.charCodeAt(i) ?? 0)) | 0;
  }
  return String(hash);
}

function cacheKey(path: string): string {
  return `GET|${cacheScope()}|${path}`;
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** Libellé humain d'une mutation en file (indicateur d'interface). */
function labelFor(path: string): string {
  if (path.startsWith("/api/manager/contributors")) return "Enregistrement d'un cotisant";
  if (path.startsWith("/api/manager/passbooks")) return "Création d'un carnet";
  if (path.startsWith("/api/manager/agents")) return "Création d'un agent";
  if (path.startsWith("/api/manager/collections")) return "Annulation d'un encaissement";
  if (path.startsWith("/api/manager/closings")) return "Validation d'une clôture";
  if (path.startsWith("/api/agent/closing")) return "Déclaration de clôture";
  if (path.startsWith("/api/admin/structures")) return "Décision sur une structure";
  if (path.startsWith("/api/demo/request")) return "Demande de démonstration";
  return "Opération enregistrée";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const method = (init?.method ?? "GET").toUpperCase();
  const isGet = method === "GET";
  const url = apiUrl(path);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  try {
    const res = await fetchWithTimeout(
      url,
      { ...init, method, credentials: "include", headers },
      isGet ? 20000 : 20000
    );
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* corps vide */
    }
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiClientError(err?.message ?? "Une erreur est survenue. Réessaie.", err?.code ?? "error");
    }
    if (isGet && typeof window !== "undefined") {
      // Écriture différée dans le cache local (write-through) — sans ralentir l'appel.
      void cachePut({
        key: cacheKey(path),
        url: path,
        scope: cacheScope(),
        data,
        cachedAt: Date.now(),
        expiresAt: Date.now() + CACHE_TTL,
      });
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiClientError) throw err;

    // ── Panne réseau / hors ligne ──
    if (typeof window !== "undefined") {
      if (isGet) {
        const entry = await cacheGet(cacheKey(path));
        if (entry) return entry.data as T;
      } else if (
        init?.body &&
        typeof init.body === "string" &&
        !NEVER_QUEUE.some((re) => re.test(path))
      ) {
        // Mutation hors ligne : mise en file + accusé fabriqué, l'interface continue.
        const event: OutboxEntry = {
          id: crypto.randomUUID(),
          url: path,
          method,
          body: init.body,
          scope: cacheScope(),
          label: labelFor(path),
          status: "PENDING",
          attempts: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        try {
          await outboxAdd(event);
          window.dispatchEvent(new CustomEvent("tontihelm:outbox-changed"));
          return { [OFFLINE_QUEUED]: true } as T;
        } catch {
          /* IndexedDB indisponible : on laisse passer l'erreur réseau */
        }
      }
    }
    throw new ApiClientError(
      "Pas de réseau. L'opération sera possible au retour de la connexion.",
      "offline"
    );
  }
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const get = <T>(path: string) => api<T>(path);

/** Purge les données locales (cache + file) — à la déconnexion. */
export async function clearOfflineData(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await cacheClear();
    await outboxClear();
    window.dispatchEvent(new CustomEvent("tontihelm:outbox-changed"));
  } catch {
    /* silencieux */
  }
}
