// TontiHelm mobile — flux temps réel /v1/events par XHR incrémental (2026-10-18).
// React Native n'expose pas EventSource : on lit le flux text/event-stream au
// fil de l'eau via XMLHttpRequest (événement progress, responseText cumulatif).
// Symétrique du flux web /api/events — mêmes événements, mêmes règles. Le jeton
// est relu à CHAQUE reconnexion (getter : il tourne toutes les 30 minutes).
// Reconnexion automatique 5 s, cœur serveur 25 s ; `close()` coupe tout.
import { API_BASE } from "./api";

export interface RealtimeChange {
  type: "collection" | "closing" | "passbook" | "contributor";
  tenantId: string;
  at: string;
  passbookId?: string;
  contributorId?: string;
  agentId?: string;
  amount?: number;
  source?: string;
}

export type RealtimeState = "connecting" | "open" | "reconnecting";

interface SubscribeOptions {
  path: string;
  /** Jeton d'accès relu à chaque (re)connexion — il expire au bout de 15 min. */
  token: () => string;
  onEvent: (ev: RealtimeChange) => void;
  onState?: (state: RealtimeState) => void;
}

/** Analyse un bloc SSE (« event: change\ndata: {...} »). */
function parseBlock(block: string, onState?: (s: RealtimeState) => void): RealtimeChange | null {
  let name = "";
  let data = "";
  for (const raw of block.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (name === "hello") {
    onState?.("open");
    return null;
  }
  if (name !== "change" || !data) return null;
  try {
    return JSON.parse(data) as RealtimeChange;
  } catch {
    return null;
  }
}

/**
 * Ouvre le flux temps réel du canal /v1. Retourne la fermeture : coupe la
 * requête en cours et stoppe les reconnexions automatiques.
 */
export function subscribeEvents(opts: SubscribeOptions): () => void {
  let closed = false;
  let xhr: XMLHttpRequest | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delay: number) => {
    if (closed) return;
    opts.onState?.("reconnecting");
    retry = setTimeout(connect, delay);
  };

  const connect = () => {
    if (closed) return;
    opts.onState?.("connecting");
    const req = new XMLHttpRequest();
    xhr = req;
    let seen = 0;
    let buffer = "";
    req.open("GET", `${API_BASE}${opts.path}`, true);
    req.setRequestHeader("Accept", "text/event-stream");
    req.setRequestHeader("Authorization", `Bearer ${opts.token()}`);
    req.onprogress = () => {
      // responseText est CUMULATIF : on ne lit que la part nouvelle, et l'on ne
      // traite que les blocs complets (terminés par une ligne vide).
      buffer += req.responseText.slice(seen);
      seen = req.responseText.length;
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const ev = parseBlock(block, opts.onState);
        if (ev) opts.onEvent(ev);
      }
    };
    // Fin de flux côté serveur ou erreur réseau : reconnexion différée.
    req.onload = () => schedule(5000);
    req.onerror = () => schedule(5000);
    req.ontimeout = () => schedule(5000);
    req.send();
  };

  connect();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    try {
      xhr?.abort();
    } catch {
      /* déjà fermée */
    }
  };
}
