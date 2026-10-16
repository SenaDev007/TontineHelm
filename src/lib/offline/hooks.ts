// TontiHelm — hooks de la couche offline-first.
import { useEffect, useRef } from "react";

/**
 * Réexécute le handler à la fin de chaque passe de synchronisation
 * (« tontihelm:sync-done ») : les listes se rafraîchissent automatiquement
 * avec les données réellement enregistrées côté serveur.
 */
export function useSyncDone(handler: () => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = () => ref.current();
    window.addEventListener("tontihelm:sync-done", fn);
    return () => window.removeEventListener("tontihelm:sync-done", fn);
  }, []);
}
