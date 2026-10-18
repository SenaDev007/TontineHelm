// TontiHelm mobile — aiguillage de démarrage : session restaurée → accueil,
// sinon → connexion. Reste invisible (splash) pendant la lecture du coffre.
import { useEffect } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { useSession } from "@/lib/session";
import { colors } from "@/theme/tokens";

export default function Index() {
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status === "anonymous") router.replace("/(auth)/login");
    if (status === "authenticated") router.replace("/(app)");
    if (status === "otp_pending") router.replace("/(auth)/otp");
  }, [status]);

  return <View className="flex-1" style={{ backgroundColor: colors.primary }} />;
}
