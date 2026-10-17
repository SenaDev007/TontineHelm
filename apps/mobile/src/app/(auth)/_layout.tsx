// TontiHelm mobile — pile d'authentification : connexion (téléphone + PIN +
// nom de l'appareil), puis code OTP. Le clavier est numérique, les cibles
// tactiles font 48 dp, aucun emoji.
import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#FFFFFF" },
      }}
    />
  );
}
