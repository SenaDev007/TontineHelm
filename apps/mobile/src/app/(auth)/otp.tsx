// TontiHelm mobile — écran OTP : code à 6 chiffres reçu par SMS (5 minutes de
// validité, 5 essais). En développement, le backend renvoie le code dans la
// réponse (devCode) — il s'affiche alors en encadré pour le terrain.
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { colors } from "@/theme/tokens";
import { useSession } from "@/lib/session";
import { ApiClientError } from "@/lib/api";

export default function OtpScreen() {
  const pending = useSession((s) => s.pending);
  const verifyOtp = useSession((s) => s.verifyOtp);
  const status = useSession((s) => s.status);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/(app)");
    if (status === "anonymous") router.replace("/(auth)/login");
  }, [status]);

  useEffect(() => {
    if (!pending) router.replace("/(auth)/login");
  }, [pending]);

  const submit = async () => {
    if (busy || !pending) return;
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Code à 6 chiffres.");
      return;
    }
    setBusy(true);
    try {
      await verifyOtp(code, pending.deviceLabel);
      router.replace("/(app)");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Code incorrect. Réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-white px-6 pt-16">
      <Text className="font-title text-[28px] leading-[34px] text-ink">Code de sécurité</Text>
      <Text className="mt-1 font-body text-base text-ink-muted">
        Saisis le code à 6 chiffres reçu par SMS. Il est valable 5 minutes.
      </Text>

      {pending?.devCode ? (
        <View className="mt-6 rounded-xl px-4 py-3" style={{ backgroundColor: colors.goldSoft }}>
          <Text className="font-body text-[14px] leading-[20px] text-ink">
            Mode développement — code reçu :{" "}
            <Text className="font-semibold tracking-[4px]">{pending.devCode}</Text>
          </Text>
        </View>
      ) : null}

      <TextInput
        className="mt-8 rounded-xl border border-line px-4 text-center font-title text-[24px] tracking-[12px] text-ink"
        style={{ minHeight: 56 }}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
        placeholder="••••••"
        placeholderTextColor={colors.inkFaint}
        inputMode="numeric"
        maxLength={6}
        autoFocus
      />

      {error ? (
        <View className="mt-6 rounded-xl px-4 py-3" style={{ backgroundColor: "#FDECEA" }}>
          <Text className="font-body text-[14px] leading-[20px] text-danger">{error}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={submit}
        disabled={busy}
        className="mt-8 items-center justify-center rounded-xl bg-primary active:bg-primary-dark"
        style={{ minHeight: 48, opacity: busy ? 0.6 : 1 }}
      >
        <Text className="font-heading text-[16px] text-white">
          {busy ? "Vérification…" : "Valider le code"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.replace("/(auth)/login")}
        className="mt-4 items-center justify-center"
        style={{ minHeight: 48 }}
      >
        <Text className="font-medium text-[14px] text-primary">Renvoyer le code</Text>
      </Pressable>
    </View>
  );
}
