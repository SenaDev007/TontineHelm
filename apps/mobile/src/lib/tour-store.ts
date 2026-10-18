// TontiHelm mobile — magasin de la tournée (phase 2) : le MIROIR LOCAL de
// /v1/sync/pull vit désormais dans la base chiffrée (SQLCipher + Drizzle).
//   · bootstrap() : l'état revient du miroir AVANT le réseau — la tournée est
//     lisible hors ligne dès le démarrage, à la fraîcheur du dernier tirage ;
//   · refresh() : tirage plein (premier appel) puis DELTA incrémental (curseur
//     serveur, upsert idempotent) — chaque réponse réussie réécrit le miroir ;
//   · moteur temps réel inchangé (flux SSE /v1/events + filet 30 s + premier
//     plan) : tout ce qui est fait côté web apparaît ici sans geste de l'agent.
// Les écritures locales provisoires (file d'envoi) partagent les mêmes listes :
// leur UUID vaut identifiant de ligne — remplacées à l'identique par les
// lignes serveur quand les accusés reviennent.
import { create } from "zustand";
import { upsertById } from "@tontihelm/sync";
import { useSession } from "./session";
import { ApiClientError } from "./api";
import { netState } from "./net-state";
import {
  getMeta,
  loadCollections,
  loadContributors,
  loadPassbooks,
  loadSnapshot,
  META_KEYS,
  replaceCollections,
  replaceContributors,
  replacePassbooks,
  saveSnapshot,
  setMeta,
  upsertCollections,
  upsertContributors,
  upsertPassbooks,
  type PersistedSnapshot,
} from "@/local/tour-cache";
import { wipeLocalData } from "@/local/db";

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
    /** Nombre de feuilles du livret (§8.14) : 12 en livret annuel. */
    months?: number;
    /** Durée du cycle en lignes (§8.14) : 1..372, 372 par défaut. */
    cycleDays?: number;
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
  neighborhoods: string[];
  stops: PullStop[];
  contributors: PullContributor[];
  collections: PullCollection[];
  summary: { expectedCash: number; mobileToday: number };
  closing: { status: string; declaredCash?: number; expectedCash?: number; gap?: number } | null;
  lastSyncAt: string | null;
  realtime: "connecting" | "open" | "reconnecting";
  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
  setRealtime: (state: TourState["realtime"]) => void;
  /** Déconnexion / révocation : le miroir local est effacé (PARITE §8.5). */
  purgeLocal: () => Promise<void>;
}

export const useTour = create<TourState>((set, get) => ({
  ready: false,
  error: null,
  refreshing: false,
  cursor: null,
  structureName: "",
  agentName: "",
  neighborhoods: [],
  stops: [],
  contributors: [],
  collections: [],
  summary: { expectedCash: 0, mobileToday: 0 },
  closing: null,
  lastSyncAt: null,
  realtime: "connecting",

  async bootstrap() {
    // Changement de structure (autre compte sur le même téléphone) : le miroir
    // appartient au précédent — on l'efface avant de lire quoi que ce soit.
    const tenantId = useSession.getState().user?.tenantId ?? null;
    if (tenantId) {
      const localTenant = await getMeta(META_KEYS.tenantId).catch(() => null);
      if (localTenant && localTenant !== tenantId) {
        await wipeLocalData();
      } else if (!localTenant) {
        await setMeta(META_KEYS.tenantId, tenantId);
      }
    }

    // 1. Miroir d'abord : tournée lisible immédiatement, même sans réseau.
    //    Le curseur survit avec lui — le démarrage repart en DELTA, sauf
    //    premier lancement (aucun instantané) où le plein s'impose.
    let hasSnapshot = false;
    try {
      const snap = await loadSnapshot();
      if (snap) {
        hasSnapshot = true;
        const [contribs, stops, colls] = await Promise.all([
          loadContributors(),
          loadPassbooks(),
          loadCollections(),
        ]);
        set({
          ready: true,
          cursor: snap.cursor,
          structureName: snap.structureName,
          agentName: snap.agentName,
          neighborhoods: snap.neighborhoods,
          contributors: contribs,
          stops,
          collections: colls,
          summary: snap.summary,
          closing: snap.closing,
          lastSyncAt: snap.lastSyncAt,
        });
      }
    } catch {
      // Miroir illisible : on passe au réseau — rattrapage plein ci-dessous.
    }
    if (!hasSnapshot) set({ cursor: null }); // snapshot complet obligatoire
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
        neighborhoods?: string[];
        contributors?: PullContributor[];
        passbooks?: PullStop[];
        collections?: PullCollection[];
        summary?: { expectedCash: number; mobileToday: number };
        closing?: { status: string; declaredCash?: number; expectedCash?: number; gap?: number } | null;
      };

      const full = body.mode !== "delta";
      const contribs = (body.contributors ?? []).map((c) => ({ ...c }));
      const stops = (body.passbooks ?? []).map((p) => ({ ...p }));
      const colls = (body.collections ?? []).map((c) => ({ ...c }));

      // Miroir AVANT mémoire : ce que le serveur a dit doit survivre à un
      // plantage juste après. Plein : remplace ; delta : upsert idempotent.
      const snap: PersistedSnapshot = {
        structureName: body.structure?.name ?? get().structureName,
        agentName: body.agent?.name ?? get().agentName,
        neighborhoods: full ? body.neighborhoods ?? [] : get().neighborhoods,
        cursor: body.cursor,
        summary: body.summary ?? get().summary,
        closing: body.closing ?? null,
        lastSyncAt: new Date().toISOString(),
      };
      await saveSnapshot(snap);
      if (full) {
        await Promise.all([replaceContributors(contribs), replacePassbooks(stops), replaceCollections(colls)]);
      } else {
        await Promise.all([upsertContributors(contribs), upsertPassbooks(stops), upsertCollections(colls)]);
      }

      set({
        ready: true,
        error: null,
        cursor: body.cursor,
        structureName: snap.structureName,
        agentName: snap.agentName,
        neighborhoods: snap.neighborhoods,
        contributors: upsertById(full ? [] : get().contributors, contribs, (c) => c.id),
        stops: upsertById(full ? [] : get().stops, stops, (p) => p.passbookId),
        collections: upsertById(full ? [] : get().collections, colls, (c) => c.id),
        summary: body.summary ?? get().summary,
        closing: body.closing ?? null,
        lastSyncAt: snap.lastSyncAt,
      });
    } catch (err) {
      // Hors réseau : l'état du miroir reste affiché, aucune erreur criarde —
      // la pastille « hors ligne » (moteur d'outbox) dit déjà l'essentiel ;
      // le moteur relancera (SSE, filet 30 s, premier plan).
      if (netState.online === false) {
        set({ error: null });
      } else {
        set({ error: err instanceof ApiClientError ? err.message : "Synchronisation impossible. Réessaie." });
      }
    } finally {
      set({ refreshing: false });
    }
  },

  setRealtime(realtime) {
    set({ realtime });
  },

  async purgeLocal() {
    set({
      ready: false,
      error: null,
      cursor: null,
      structureName: "",
      agentName: "",
      neighborhoods: [],
      stops: [],
      contributors: [],
      collections: [],
      summary: { expectedCash: 0, mobileToday: 0 },
      closing: null,
      lastSyncAt: null,
      realtime: "connecting",
    });
    await wipeLocalData();
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
