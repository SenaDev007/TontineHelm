// TontiHelm mobile — pile applicative : le moteur temps réel (flux SSE /v1/events
// + filet 30 s + retour au premier plan) maintient le magasin de tournée à jour
// pendant TOUTE la session — tout ce qui est fait côté web apparaît ici sans
// geste, et inversement. Les écrans métiers restants (barre agent à 5 entrées,
// back-office gérant, administration, inscription) arrivent aux phases 2 à 4.
import { Stack } from "expo-router";
import { TourEngine } from "@/lib/tour-engine";

export default function AppLayout() {
  return (
    <>
      <TourEngine />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#FFFFFF" },
        }}
      />
    </>
  );
}
