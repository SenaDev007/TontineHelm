"use client";
// TontiHelm — temps réel WEB (décision du dirigeant, 2026-10-18) : tout ce qui
// est fait — encaissement saisi sur le site web, encaissement poussé par
// l'app mobile, clôture validée — est publié sur le flux SSE /api/events.
// L'application qui s'y abonne rafraîchit ses données sans action de
// l'utilisateur : plus besoin d'actualiser la page pour voir les écritures
// de l'autre canal.
// Authentification : jeton de session en paramètre d'URL (EventSource ne peut
// PAS poser d'en-tête Authorization) — jeton ordinaire, même validité 30 j.
import { useEffect, useRef } from "react";
import { apiUrl, getToken } from "./client";

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

/**
 * S'abonne au flux temps réel de la structure et rappelle `onChange` à chaque
 * changement. Reconnexion automatique par le navigateur (retry 5 s côté
 * serveur) ; silencieux en cas de coupure réseau (le rappel ne partira plus
 * jusqu'au retour du flux, l'interface garde son état).
 */
export function useRealtime(onChange: (ev: RealtimeChange) => void): void {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const token = getToken();
    const base = apiUrl("/api/events");
    const url = `${base}${base.includes("?") ? "&" : "?"}token=${encodeURIComponent(token ?? "")}`;
    const es = new EventSource(url);
    const handleChange = (msg: MessageEvent) => {
      try {
        cbRef.current(JSON.parse(String(msg.data)) as RealtimeChange);
      } catch {
        /* payload illisible : ignoré */
      }
    };
    es.addEventListener("change", handleChange as EventListener);
    return () => {
      es.removeEventListener("change", handleChange as EventListener);
      es.close();
    };
  }, []);
}
