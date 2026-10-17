// TontiHelm mobile — moteur temps réel (2026-10-18) : monte UNE fois dans la
// pile (app), démarre la traction initiale puis maintient la fraîcheur des
// données par TROIS mécanismes complémentaires :
//   1. flux SSE /v1/events — pousse chaque écriture (web OU mobile) dès qu'elle
//      arrive : traction delta immédiate (temps réel proprement dit) ;
//   2. filet de sécurité : pull delta toutes les 30 s (flux coupé en silence,
//      réseau mobile instable) — 2 req/min, loin du plafond 300 req/min ;
//   3. retour au premier plan (AppState) : rattrapage après écran éteint.
// La file d'attente hors ligne (outbox) arrive en phase 2.
import { useEffect } from "react";
import { AppState } from "react-native";
import { useSession } from "./session";
import { useTour } from "./tour-store";
import { subscribeEvents, type RealtimeChange } from "./events";

const SAFETY_PULL_MS = 30_000;

export function TourEngine() {
  const bootstrap = useTour((s) => s.bootstrap);
  const refresh = useTour((s) => s.refresh);
  const setRealtime = useTour((s) => s.setRealtime);

  useEffect(() => {
    void bootstrap();

    // Anti-tempête : une traction delta au plus par seconde (lots d'écritures).
    let lastPull = 0;
    const pullDelta = (force = false) => {
      const now = Date.now();
      if (!force && now - lastPull < 1000) return;
      lastPull = now;
      void refresh();
    };

    // 1. Flux temps réel : chaque changement (écrit des DEUX canaux) déclenche
    //    une traction delta — c'est le « vice versa » web ↔ mobile.
    const unsubscribe = subscribeEvents({
      path: "/v1/events",
      token: () => useSession.getState().tokens?.accessToken ?? "",
      onEvent: (ev: RealtimeChange) => {
        if (ev.type === "collection" || ev.type === "closing") pullDelta();
      },
      onState: setRealtime,
    });

    // 2. Filet de sécurité périodique.
    const interval = setInterval(() => pullDelta(true), SAFETY_PULL_MS);

    // 3. Retour au premier plan.
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") pullDelta(true);
    });

    return () => {
      unsubscribe();
      clearInterval(interval);
      appState.remove();
    };
  }, [bootstrap, refresh, setRealtime]);

  return null;
}
