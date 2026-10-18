// TontiHelm mobile — navigateur racine : polices (Plus Jakarta Sans + Inter),
// splash tant que la session démarre, pile expo-router avec groupes
// (auth) / (app). Correction de phase 2 : l'import du CSS remonte à la
// RACINE du projet (../../global.css) — ../ pointait vers src/ et cassait
// le bundle (piégé par l'export de vérification Metro, jamais lancé avant).
import "../../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { colors } from "@/theme/tokens";
import { useSession } from "@/lib/session";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const status = useSession((s) => s.status);
  const bootstrap = useSession((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (fontsLoaded && status !== "boot") {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, status]);

  if (!fontsLoaded || status === "boot") {
    // Le splash natif (#0F6B4A) reste affiché pendant le démarrage à froid.
    return null;
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={colors.primary} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
          animation: "fade",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}
