// TontiHelm mobile — écran Connexion (socle phase 1, PARITE.md §8.7) :
// téléphone + PIN 6 chiffres + nom de l'appareil (enregistrement), envoi vers
// l'écran OTP quand le serveur exige le code. Textes du web (« Saisis ton
// numéro complet, sans espace. ») — mêmes règles, même langue.
import { useState } from "react";
import { router } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Logo } from "@/theme/Logo";
import { colors } from "@/theme/tokens";
import { useSession } from "@/lib/session";
import { ApiClientError } from "@/lib/api";

export default function LoginScreen() {
  const login = useSession((s) => s.login);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (phone.replace(/\D/g, "").length < 8) {
      setError("Numéro invalide. Saisis ton numéro complet, sans espace.");
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError("Code PIN à 6 chiffres.");
      return;
    }
    if (deviceLabel.trim().length < 2) {
      setError("Nomme l'appareil pour le reconnaître (p. ex. « Samsung A15 de Yao »).");
      return;
    }
    setBusy(true);
    try {
      const next = await login(phone.trim(), pin, deviceLabel.trim());
      if (next === "otp") router.replace("/(auth)/otp");
      else router.replace("/(app)/home");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Connexion impossible. Réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === "android" ? "height" : "padding"}
    >
      <ScrollView
        contentContainerClassName="px-6 pb-10 pt-16"
        keyboardShouldPersistTaps="handled"
      >
        <Logo />
        <Text className="mt-8 font-title text-[28px] leading-[34px] text-ink">
          Bonjour
        </Text>
        <Text className="mt-1 font-body text-base text-ink-muted">
          Connecte-toi avec ton numéro et ton code PIN.
        </Text>

        <Text className="mt-8 font-medium text-[13px] uppercase text-ink-muted">
          Téléphone
        </Text>
        <TextInput
          className="mt-2 rounded-xl border border-line px-4 font-body text-base text-ink"
          style={{ minHeight: 48 }}
          value={phone}
          onChangeText={setPhone}
          placeholder="97 12 34 56"
          placeholderTextColor={colors.inkFaint}
          inputMode="tel"
          autoCapitalize="none"
          autoComplete="tel"
        />

        <Text className="mt-5 font-medium text-[13px] uppercase text-ink-muted">
          Code PIN (6 chiffres)
        </Text>
        <TextInput
          className="mt-2 rounded-xl border border-line px-4 font-body text-base tracking-[8px] text-ink"
          style={{ minHeight: 48 }}
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••••"
          placeholderTextColor={colors.inkFaint}
          inputMode="numeric"
          secureTextEntry
          maxLength={6}
        />

        <Text className="mt-5 font-medium text-[13px] uppercase text-ink-muted">
          Nom de l'appareil
        </Text>
        <TextInput
          className="mt-2 rounded-xl border border-line px-4 font-body text-base text-ink"
          style={{ minHeight: 48 }}
          value={deviceLabel}
          onChangeText={setDeviceLabel}
          placeholder="Samsung A15 de Yao"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="sentences"
        />
        <Text className="mt-2 font-body text-[13px] leading-[18px] text-ink-muted">
          Un code te sera envoyé par SMS pour enregistrer cet appareil. Ton gérant
          pourra le retirer à distance en cas de perte.
        </Text>

        {error ? (
          <View
            className="mt-6 rounded-xl px-4 py-3"
            style={{ backgroundColor: "#FDECEA" }}
          >
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
            {busy ? "Connexion…" : "Se connecter"}
          </Text>
        </Pressable>

        <Text className="mt-6 text-center font-body text-[13px] leading-[18px] text-ink-muted">
          Pas encore de compte ? Demande à ton dirigeant de t'inviter, ou crée
          ta structure depuis tontihelm.com.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
