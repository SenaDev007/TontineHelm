// TontiHelm mobile — magasin de la file d'envoi hors ligne (phase 2, écarts
// n° 6/7/26 du PARITE) : les encaissements saisis SANS réseau tombent dans la
// base chiffrée (SQLCipher) et repartent seuls, à la cadence 2/4/8/16 s puis
// 5 min, dès que le réseau revient (ou l'app au premier plan). Accusés PAR
// ÉVÉNEMENT du serveur : accepté/doublon → terminé (le miroir des écritures
// prend le relais) ; rejeté → rang conservé avec son motif pour l'écran de
// reprise de l'agent (Compte) — jamais rejoué automatiquement.
// La machine à états elle-même vit dans @tontihelm/sync (pure, testée) ;
// ce magasin n'est que l'adaptateur durable : SQLite + HTTP /v1.
import { create } from "zustand";
import {
  counts as countItems,
  dueBatch,
  isBlockedByAge,
  markInFlight,
  newItem,
  onAck,
  onTransportError,
  recoverInFlight,
  type OutboxEvent,
  type OutboxItem,
} from "@tontihelm/sync";
import { ApiClientError } from "./api";
import { useSession } from "./session";
import { useTour } from "./tour-store";
import { setNetOnline } from "./net-state";
import { uuidv7 } from "@/lib/uuid";
import {
  deleteCollections,
  getMeta,
  insertProvisionalCollections,
  setMeta,
  META_KEYS,
} from "@/local/tour-cache";
import {
  deleteOutboxItem,
  deleteOutboxItems,
  loadOutbox,
  saveNewOutboxItems,
  updateOutboxItems,
} from "@/local/outbox-repo";

/** Ce que l'agent met en file (l'écran Encaisser remplit le reste). */
export interface EnqueueInput {
  passbookId: string;
  amount: number;
  method?: "cash" | "mobile_money";
  advance?: boolean;
}

/** Un rejet à relire, présenté à l'agent dans l'écran de reprise. */
export interface RejectedRow {
  id: string;
  amount: number;
  passbookId: string;
  passbookNumber: string;
  collectedAt: string;
  code: string;
  message: string;
}

interface PushAckDto {
  id: string;
  status: "accepted" | "duplicate" | "rejected";
  collectionId?: string;
  reason?: { code: string; message: string };
}

interface OutboxState {
  ready: boolean;
  online: boolean | null;
  /** Écritures non encore confirmées (pending + in_flight) — indicateur permanent. */
  pending: number;
  /** Espèces des écritures en attente — la Clôture en a besoin. */
  pendingCash: number;
  flushing: boolean;
  rejected: RejectedRow[];
  /** Hors ligne depuis plus de 7 jours : nouvelles saisies bloquées (écart n° 7). */
  blocked: boolean;
  lastPushAt: string | null;
  lastError: string | null;
  bootstrap: () => Promise<void>;
  setOnline: (online: boolean) => void;
  enqueue: (inputs: EnqueueInput[]) => Promise<void>;
  flushDue: () => Promise<void>;
  syncNow: () => Promise<void>;
  dismissRejected: (id: string) => Promise<void>;
  refreshCounts: () => Promise<void>;
  reset: () => void;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  return "Réseau indisponible. L'écriture repartira seule.";
}

/** Rejets prêts à afficher : on joint le numéro de carnet depuis le miroir. */
function rejectedRows(items: OutboxItem[]): RejectedRow[] {
  const stops = useTour.getState().stops;
  return items
    .filter((item) => item.status === "rejected")
    .map((item) => ({
      id: item.id,
      amount: item.payload.amount,
      passbookId: item.payload.passbookId,
      passbookNumber: stops.find((s) => s.passbookId === item.payload.passbookId)?.passbookNumber ?? "—",
      collectedAt: item.payload.collectedAt,
      code: item.ack?.reason?.code ?? "rejected",
      message: item.ack?.reason?.message ?? "Écriture refusée par le serveur.",
    }))
    .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
}

export const useOutbox = create<OutboxState>((set, get) => ({
  ready: false,
  online: null,
  pending: 0,
  pendingCash: 0,
  flushing: false,
  rejected: [],
  blocked: false,
  lastPushAt: null,
  lastError: null,

  async bootstrap() {
    // Récupération de crash : les rangs restés in_flight (réponse jamais
    // revenue au redémarrage) repartent en file, dus maintenant — le serveur
    // tranche ensuite (création, ou doublon idempotent par UUID).
    const items = await loadOutbox();
    const now = Date.now();
    const recovered = items.map((item) => recoverInFlight(item, now));
    const changed = recovered.filter((item, i) => item !== items[i]);
    if (changed.length) await updateOutboxItems(changed);
    set({ ready: true });
    await get().refreshCounts();
    await get().flushDue();
  },

  setOnline(online) {
    setNetOnline(online);
    set({ online });
  },

  async enqueue(inputs) {
    if (!inputs.length) return;
    const { device } = useSession.getState();
    const now = Date.now();
    const clientTime = new Date().toISOString();
    const events: OutboxEvent[] = inputs.map((input) => ({
      id: uuidv7(),
      passbookId: input.passbookId,
      amount: input.amount,
      method: input.method ?? "cash",
      advance: input.advance ?? false,
      collectedAt: clientTime,
      deviceId: device?.id,
      clientTime,
    }));
    const items = events.map((ev) => newItem(ev, now));
    // Écriture locale atomique d'usage : le rang de file + la ligne provisoire
    // du miroir (même UUID) — l'écran peut afficher « pris aujourd'hui ».
    await saveNewOutboxItems(items);
    await insertProvisionalCollections(events);
    await get().refreshCounts();
    // Tentative immédiate : en ligne, l'accusé revient dans la seconde ;
    // hors ligne, l'échec de transport arme la cadence 2/4/8/16 s → 5 min.
    void get().flushDue();
  },

  async flushDue() {
    if (get().flushing) return; // un seul envoi à la fois (lots FIFO ≤ 50)
    set({ flushing: true });
    try {
      const batch = dueBatch(await loadOutbox(), Date.now());
      if (!batch.length) return;

      const now = Date.now();
      const inFlight = batch.map((item) => markInFlight(item, now));
      await updateOutboxItems(inFlight);

      try {
        const { authedPost } = useSession.getState();
        const body = (await authedPost("/v1/sync/push", {
          events: inFlight.map((item) => ({
            ...item.payload,
            // clientTime rafraîchi : le serveur mesure le décalage d'horloge (§8.6).
            clientTime: new Date().toISOString(),
          })),
          clientTime: new Date().toISOString(),
        })) as { acks?: PushAckDto[] };

        const acks = new Map((body.acks ?? []).map((a) => [a.id, a]));
        const updates: OutboxItem[] = [];
        const doneIds: string[] = [];
        const rejectedIds: string[] = [];
        for (const item of inFlight) {
          const ack =
            acks.get(item.id) ??
            ({
              status: "rejected",
              reason: { code: "missing_ack", message: "Le serveur n'a pas répondu pour cet encaissement." },
            } as PushAckDto);
          const next = onAck(item, ack, Date.now());
          updates.push(next);
          if (next.status === "synced") doneIds.push(next.id);
          else if (next.status === "rejected") rejectedIds.push(next.id);
        }
        await updateOutboxItems(updates);
        // Terminés : le rang part — la ligne du miroir (même id) est déjà la
        // vérité. Rejetés : la ligne provisoire disparaît, le rang reste relu.
        if (doneIds.length) await deleteOutboxItems(doneIds);
        if (rejectedIds.length) await deleteCollections(rejectedIds);
        if (doneIds.length || rejectedIds.length) {
          const at = new Date().toISOString();
          await setMeta(META_KEYS.lastPushAt, at);
          set({ lastPushAt: at, lastError: null });
          // Le livret côté téléphone (et le web connecté) suivent l'écriture.
          void useTour.getState().refresh();
        }
      } catch (err) {
        // Transport coupé (fetch, 5xx, 429) : tout le lot revient en file à
        // la cadence du brief — un rejet MÉTIER ne peut pas atterir ici, il
        // est déjà tranché par les accusés ci-dessus.
        const at = Date.now();
        const message = errorMessage(err);
        await updateOutboxItems(inFlight.map((item) => onTransportError(item, at, message)));
        set({ lastError: message });
      }
    } finally {
      set({ flushing: false });
      await get().refreshCounts();
    }
  },

  async syncNow() {
    await get().flushDue();
    // Rattrapage immédiat des données de référence après le retour du réseau.
    if (netOnline(get().online)) await useTour.getState().refresh();
  },

  async dismissRejected(id) {
    await deleteOutboxItem(id);
    await get().refreshCounts();
  },

  async refreshCounts() {
    const items = await loadOutbox();
    const { pending, inFlight } = countItems(items);
    let pendingCash = 0;
    for (const item of items) {
      if ((item.status === "pending" || item.status === "in_flight") && item.payload.method === "cash") {
        pendingCash += item.payload.amount;
      }
    }
    set({
      pending: pending + inFlight,
      pendingCash,
      rejected: rejectedRows(items),
      blocked: isBlockedByAge(items, Date.now()),
      lastPushAt: await getMetaLocal(),
    });
  },

  reset() {
    set({
      pending: 0,
      pendingCash: 0,
      rejected: [],
      blocked: false,
      lastError: null,
      flushing: false,
    });
  },
}));

function netOnline(online: boolean | null): boolean {
  return online !== false; // null = inconnu : on tente
}

async function getMetaLocal(): Promise<string | null> {
  try {
    return await getMeta(META_KEYS.lastPushAt);
  } catch {
    return null;
  }
}
