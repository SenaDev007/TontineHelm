// TontiHelm mobile — pile applicative (socle phase 1) : un écran d'accueil
// vérifie TOUTE la chaîne /v1 (me + sync/pull) et affiche l'état de session.
// Les écrans métier — barre agent à 5 entrées (Tournée, Encaisser, Clients,
// Clôture, Compte — décision n° 18), back-office gérant, administration,
// inscription — arrivent aux phases 2 à 4.
import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#FFFFFF" },
      }}
    />
  );
}
