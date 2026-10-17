// TontiHelm mobile — magasin de la tournée (2026-10-18) : snapshot /v1/sync/pull
// complet au premier appel, puis DELTA incrémental (curseur serveur, upsert
// idempotent). Alimenté par le moteur temps réel (flux SSE /v1/events + filet
// de sécurité 30 s + retour au premier plan) : tout ce qui est fait côté web
// apparaît ici sans geste de l'agent, et inversement.
// La persistance locale chiffrée (SQLite + outbox) arrive en phase 2 — ce
// magasin vit en mémoire le temps de la session.
import { create } from "zustand";
import { useSession } from "./session";
import { ApiClientError } from "./api";

export interface PullContributor {
  id: string;
  fullName: string;
  phone: string | null;
  neighborhood: string | null;
}

export interface PullAdvanceOption {
  sheet: number;
  label: string;
  amount: number;
  resteAfter: number;
}

export interface PullStop {
  passbookId: string;
  passbookNumber: string;
  passbookLabel: string | null;
  contributorId: string;
  dailyAmount: number;
  balance: number;
  status: string;
  statusLabel: string;
  livret: {
    currentSheet: number;
    dueLineInSheet: number;
    lineDue: number;
    coveredLines: number;
    payableLines: number;
    missedLines: number;
    advanceOptions: PullAdvanceOption[];
    sheets: { shortLabel: string }[];
    recap: { attendu: number; encaisse: number; reste: number; avanceTotale: number };
    payable: { line: number; sheet: number; lineInSheet: number; company: boolean; label: string }[];
    sheet: { index: number; label: string; attendu: number; encaisse: number; avance: number; reste: number };
  };
}

export interface PullCollection {
  id: string;
  passbookId: string;
  amount: number;
  method: string;
  collectedAt: string;
}

interface TourState {
  ready: boolean;
  error: string | null;
  refreshing: boolean;
  cursor: string | null;
  structureName: string;
  agentName: string;
  stops: PullStop[];
  contributors: PullContributor[];
  collections: PullCollection[];
  summary: { expectedCash: number; mobileToday: number };
  closing: { status: string } | null;
  lastSyncAt: string | null;
  realtime: "connecting" | "open" | "reconnecting";
  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
  setRealtime: (state: TourState["realtime"]) => void;
}

function upsertById<T extends { id?: string; passbookId?: string }>(list: T[], items: T[], keyOf: (item: T) => string): T[] {
  const map = new Map(list.map((item) => [keyOf(item), item]));
  for (const item of items) map.set(keyOf(item), item);
  return [...map.values()];
}

export const useTour = create<TourState>((set, get) => ({
  ready: false,
  error: null,
  refreshing: false,
  cursor: null,
  structureName: "",
  agentName: "",
  stops: [],
  contributors: [],
  collections: [],
  summary: { expectedCash: 0, mobileToday: 0 },
  closing: null,
  lastSyncAt: null,
  realtime: "connecting",

  async bootstrap() {
    set({ cursor: null }); // force le snapshot complet
    await get().refresh();
  },

  async refresh() {
    if (get().refreshing) return; // une seule traction à la fois
    set({ refreshing: true });
    try {
      const { authedGet } = useSession.getState();
      const cursor = get().cursor;
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const body = (await authedGet(`/v1/sync/pull${query}`)) as {
        mode: "full" | "delta";
        cursor: string;
        structure?: { name?: string };
        agent?: { name?: string };
        contributors?: PullContributor[];
        passbooks?: PullStop[];
        collections?: PullCollection[];
        summary?: { expectedCash: number; mobileToday: number };
        closing?: { status: string } | null;
      };

      const full = body.mode !== "delta";
      set({
        ready: true,
        error: null,
        cursor: body.cursor,
        structureName: body.structure?.name ?? get().structureName,
        agentName: body.agent?.name ?? get().agentName,
        contributors: upsertById(
          full ? [] : get().contributors,
          (body.contributors ?? []).map((c) => ({ ...c })),
          (c) => c.id
        ),
        stops: upsertById(
          full ? [] : get().stops,
          (body.passbooks ?? []).map((p) => ({ ...p })),
          (p) => p.passbookId
        ),
        collections: upsertById(
          full ? [] : get().collections,
          (body.collections ?? []).map((c) => ({ ...c })),
          (c) => c.id
        ),
        summary: body.summary ?? get().summary,
        closing: body.closing ?? null,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (err) {
      // Hors réseau : on garde l'état connu ; le moteur retentera (30 s, premier plan).
      set({ error: err instanceof ApiClientError ? err.message : "Synchronisation impossible. Réessaie." });
    } finally {
      set({ refreshing: false });
    }
  },

  setRealtime(realtime) {
    set({ realtime });
  },
}));

/** Cotisant d'un arrêt (nom, quartier) par son identifiant. */
export function contributorOf(stop: PullStop): PullContributor | null {
  return useTour.getState().contributors.find((c) => c.id === stop.contributorId) ?? null;
}

/** Encaissements du jour d'un carnet (indicateur « déjà encaissé »). */
export function todayOf(stop: PullStop): { count: number; amount: number } | null {
  const day = new Date().toISOString().slice(0, 10);
  const rows = useTour.getState().collections.filter(
    (c) => c.passbookId === stop.passbookId && c.amount > 0 && c.collectedAt.slice(0, 10) === day
  );
  return rows.length ? { count: rows.length, amount: rows.reduce((s, c) => s + c.amount, 0) } : null;
}
