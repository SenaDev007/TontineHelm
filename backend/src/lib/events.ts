// TontiHelm — événements temps réel (décision du dirigeant, 2026-10-18) :
// tout ce qui est fait côté web doit être vu en temps réel sur l'app mobile,
// et vice versa. Pub/sub EN MÉMOIRE du process, cloisonné par structure
// (tenant) : les écritures publient, les flux SSE des deux canaux
// (/api/events session web, /v1/events jeton mobile) relaient aux clients
// connectés. Le web rafraîchit alors ses requêtes ; l'app Android consomme
// le même flux (XHR incremental) et déclenche un pull delta au besoin.
// Champ d'application mono-process (Railway) : identique au compteur de
// débit /v1 — documenté, sans effet de bord si monté en répliques.

export interface TenantEvent {
  /** Nature du changement : écriture d'encaissement, clôture, fiche… */
  type: "collection" | "closing" | "passbook" | "contributor";
  tenantId: string;
  /** Horodatage serveur ISO. */
  at: string;
  passbookId?: string;
  contributorId?: string;
  agentId?: string;
  amount?: number;
  /** Canal d'origine : "sync" (web) ou "sync_v1" (mobile). */
  source?: string;
}

type Listener = (event: TenantEvent) => void;

const listenersByTenant = new Map<string, Set<Listener>>();

/** Abonne un flux à UNE structure ; retourne la fermeture (désabonnement). */
export function subscribeTenant(tenantId: string, listener: Listener): () => void {
  let set = listenersByTenant.get(tenantId);
  if (!set) {
    set = new Set();
    listenersByTenant.set(tenantId, set);
  }
  set.add(listener);
  const unsubscribe = () => {
    set.delete(listener);
    if (set.size === 0) listenersByTenant.delete(tenantId);
  };
  return unsubscribe;
}

/**
 * Publie un changement aux flux de la structure. SYNCHRONE et sans exception
 * propagée : un flux cassé ne doit jamais interrompre l'écriture métier.
 */
export function publishTenantEvent(event: TenantEvent): void {
  const set = listenersByTenant.get(event.tenantId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      /* flux mort : ignoré */
    }
  }
}

/** Ouvre un flux SSE pour un tenant : hello, événements change, cœur 25 s. */
export function openTenantStream(
  req: { on: (event: "close", cb: () => void) => void },
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    write: (chunk: string) => boolean;
  },
  tenantId: string | null
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // Reconnexion navigateur après 5 s de coupure.
  res.write("retry: 5000\n\n");
  res.write(`event: hello\ndata: ${JSON.stringify({ tenantId, at: new Date().toISOString() })}\n\n`);

  const unsubscribe = tenantId
    ? subscribeTenant(tenantId, (ev) => {
        res.write(`event: change\ndata: ${JSON.stringify(ev)}\n\n`);
      })
    : undefined;

  // Cœur : garde les intermédiaires (proxy, passerelle) de fermer le flux.
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe?.();
  });
}
