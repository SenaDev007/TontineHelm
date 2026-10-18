// TontiHelm mobile — moteur de reprise de la file d'envoi (phase 2, écart
// n° 26) : monte UNE fois dans la pile (app), à côté du moteur temps réel
// (tireur du pull — tour-engine). TroIS déclencheurs d'envoi :
//   1. retour du réseau (NetInfo) → reprise immédiate de tout ce qui est dû ;
//   2. retour au premier plan (AppState) → même chose (téléphone sorti de
//      poche, tâche tuée puis rouverte) ;
//   3. réveil cadencé : la plus proche tentative de la file (2 s → 4 s →
//      8 s → 16 s, puis 5 minutes — machine @tontihelm/sync), arborée après
//      chaque envoi. L'enregistrement d'un encaissement tente lui-même
//      immédiatement (en ligne : accusé dans la seconde).
// La relance en TÂCHE DE FOND OS (expo-background-task, ≥ 15 min imposées par
// Android) est le prochain incrément : elle ne peut de toute façon pas tenir
// la cadence courte du brief, que ce moteur premier plan tient seul ici.
import { useEffect } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { SETTLED_POLL_MS, wakeAt } from "@tontihelm/sync";
import { useOutbox } from "./outbox-store";
import { loadOutbox } from "@/local/outbox-repo";

/** Plafond du réveil : jamais plus de 5 minutes sans regarder la file. */
const WAKE_CAP_MS = SETTLED_POLL_MS;

export function OutboxEngine() {
  const bootstrap = useOutbox((s) => s.bootstrap);
  const syncNow = useOutbox((s) => s.syncNow);
  const setOnline = useOutbox((s) => s.setOnline);

  useEffect(() => {
    void bootstrap();

    // 1. Réseau : la pastille suit, le RETOUR coupe la reprise immédiate.
    let wasOnline: boolean | null = null;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable);
      setOnline(online);
      if (wasOnline === false && online) void syncNow();
      wasOnline = online;
    });

    // 2. Premier plan : la file a peut-être mûri pendant l'écran éteint.
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncNow();
    });

    // 3. Réveil cadencé : la plus proche échéance de la file, plafonnée.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const scheduleWake = async () => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      let delay: number | null = null;
      try {
        const at = wakeAt(await loadOutbox());
        if (at !== null) delay = Math.min(Math.max(at - Date.now(), 250), WAKE_CAP_MS);
      } catch {
        delay = WAKE_CAP_MS; // base illisible : battement lent de sécurité
      }
      if (delay === null) return; // file vide : le prochain enqueue réveillera
      timer = setTimeout(async () => {
        await syncNow().catch(() => undefined);
        await scheduleWake();
      }, delay);
    };
    void scheduleWake();

    return () => {
      disposed = true;
      unsubscribeNet();
      appState.remove();
      if (timer) clearTimeout(timer);
    };
  }, [bootstrap, syncNow, setOnline]);

  return null;
}
