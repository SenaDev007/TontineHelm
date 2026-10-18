// TontiHelm — délais de reprise de la file d'envoi (PARITE.md écart n° 26) :
//   reprise 2 s → 4 s → 8 s → 16 s, puis toutes les 5 minutes ;
//   blocage des nouvelles saisies après 7 jours hors ligne (écart n° 7).
// Pures fonctions sans dépendance : testées sous bun, consommées par la couche
// locale du téléphone (apps/mobile) comme par tout futur consommateur web.

/** Délais consécutifs après un échec de transport (réseau coupé, 5xx, 429). */
export const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000] as const;

/** Rythme d'équilibre une fois les quatre reprises rapides épuisées. */
export const SETTLED_POLL_MS = 5 * 60_000;

/** Au-delà, l'agent doit resynchroniser avant de continuer à encaisser. */
export const OFFLINE_BLOCK_MS = 7 * 24 * 60 * 60_000;

/**
 * Délai avant la prochaine tentative, après `attempt` échecs de transport
 * déjà subis (1 = le premier échec vient d'arriver).
 *   delayForAttempt(1) = 2 s … delayForAttempt(4) = 16 s, puis 5 min.
 */
export function delayForAttempt(attempt: number): number {
  const i = Math.max(0, attempt) - 1;
  if (i < RETRY_DELAYS_MS.length) return RETRY_DELAYS_MS[i] as number;
  return SETTLED_POLL_MS;
}

/** Horodatage (epoch ms) de la prochaine tentative, après `attempt` échecs. */
export function nextAttemptAt(attempt: number, now: number): number {
  return now + delayForAttempt(attempt);
}
