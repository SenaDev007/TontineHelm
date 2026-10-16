"use client";
// TontiHelm — page d'inscription (route réelle /inscription).
import { useRouter } from "next/navigation";
import { RegisterScreen } from "@/components/tontihelm/register/RegisterScreen";

export function InscriptionScreen() {
  const router = useRouter();
  return (
    <RegisterScreen
      onBack={() => router.push("/")}
      onDone={() => router.push("/")}
    />
  );
}
