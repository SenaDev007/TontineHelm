"use client";
// TontiHelm — page de connexion (route réelle /connexion) : le site vitrine,
// l'inscription et la connexion ont chacune leur adresse partageable.
import { useRouter } from "next/navigation";
import { LoginScreen } from "@/components/tontihelm/auth/LoginScreen";

export function ConnexionScreen() {
  const router = useRouter();
  return (
    <LoginScreen
      onBack={() => router.push("/")}
      onLoggedIn={() => router.push("/")}
    />
  );
}
