// TontiHelm mobile — état réseau partagé entre magasins (phase 2). Le moteur
// d'outbox y écrit (NetInfo) ; le magasin de tournée y lit pour NE PAS marquer
// d'erreur quand il est simplement hors ligne (les données du miroir local
// restent affichées, seule la pastille change). Module à plat : zéro cycle
// d'import entre zustand stores.
export const netState = {
  online: null as boolean | null,
};

export function setNetOnline(online: boolean | null): void {
  netState.online = online;
}
