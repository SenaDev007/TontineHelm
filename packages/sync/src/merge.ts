// TontiHelm — fusion d'un tirage /v1/sync/pull dans l'état local : upsert
// idempotent par identifiant (un même objet peut revenir deux fois — le curseur
// serveur est capturé AVANT les lectures). Plein (premier appel) : repart de
// zéro ; delta : complète l'existant. Extrait du magasin de tournée phase 1
// pour devenir la règle partagée — le web pourra s'en servir tel quel.
export { upsertById } from "./upsert";
