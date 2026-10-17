// TontiHelm mobile — accueil (2026-10-18) : carte de session, indicateurs de
// la tournée depuis le magasin temps réel (traction /v1/sync/pull entretenue
// par le moteur SSE + 30 s + premier plan — tout ce qui est fait côté web
// apparaît ici sans geste), accès à l'écran Encaisser, déconnexion.
// Les écrans restants de la barre agent à 5 entrées arrivent en phase 2.
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme/tokens";
import { useSession } from "@/lib/session";
import { useTour } from "@/lib/tour-store";
import { ApiClientError } from "@/lib/api";
import { formatFCFA } from "@tontihelm/domain";

export default function HomeScreen() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const device = useSession((s) => s.device);
  const status = useSession((s) => s.status);
  const logout = useSession((s) => s.logout);

  const ready = useTour((s) => s.ready);
  const structureName = useTour((s) => s.structureName);
  const stops = useTour((s) => s.stops);
  const summary = useTour((s) => s.summary);
  const lastSyncAt = useTour((s) => s.lastSyncAt);
  const realtime = useTour((s) => s.realtime);
  const error = useTour((s) => s.error);
  const refresh = useTour((s) => s.refresh);
  const refreshing = useTour((s) => s.refreshing);
  const [busy, setBusy] = useState(false);

  // Déconnexion → retour à l'écran de connexion.
  useEffect(() => {
    if (status === "anonymous") router.replace("/(auth)/login");
  }, [status, router]);

  const runRefresh = async () => {
    if (busy || refreshing) return;
    setBusy(true);
    try {
      await refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        router.replace("/(auth)/login");
      }
    } finally {
      setBusy(false);
    }
  };

  const totalBalance = stops.reduce((s, p) => s + p.balance, 0);
  const collectable = stops.filter((s) => s.status === "active" || s.status === "late");

  const realtimeLabel =
    realtime === "open" ? "Temps réel actif" : realtime === "connecting" ? "Connexion…" : "Reconnexion…";
  const realtimeColor = realtime === "open" ? colors.primary : colors.warning;

  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentContainerClassName="px-6 pb-10 pt-16"
      refreshControl={
        <RefreshControl refreshing={refreshing || busy} onRefresh={runRefresh} tintColor={colors.primary} />
      }
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-title text-[28px] leading-[34px] text-ink">TontiHelm</Text>
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.goldSoft }}>
          <Text className="font-medium text-[11px]" style={{ color: realtimeColor }}>
            {realtimeLabel}
          </Text>
        </View>
      </View>

      <View className="mt-6 rounded-2xl bg-primary-soft p-5">
        <Text className="font-heading text-[16px] text-primary-dark">{user?.fullName ?? "—"}</Text>
        <Text className="mt-1 font-body text-[14px] text-ink">
          {user?.phone} · {roleLabel(user?.role)}
        </Text>
        <Text className="mt-1 font-body text-[14px] text-ink-muted">
          {structureName || user?.structureName || "Aucune structure"}
        </Text>
        <View className="mt-3 flex-row items-center">
          <View className="rounded-full bg-gold-soft px-3 py-1">
            <Text className="font-medium text-[12px] text-ink">{device?.label ?? "—"}</Text>
          </View>
        </View>
      </View>

      {/* Indicateurs de la tournée — entretenus en temps réel */}
      <View className="mt-4 rounded-2xl border border-line p-5">
        <Text className="font-heading text-[16px] text-ink">Tournée du jour</Text>
        {!ready ? (
          <Text className="mt-2 font-body text-[14px] text-ink-muted">Chargement de la tournée…</Text>
        ) : (
          <>
            <Text className="mt-2 font-body text-[14px] text-ink-muted">
              Carnets actifs : {collectable.length}
            </Text>
            <Text className="mt-1 font-body text-[14px] text-ink-muted">
              Espèces attendues aujourd'hui : {formatFCFA(summary.expectedCash)}
            </Text>
            <Text className="mt-3 font-semibold text-[18px] text-primary">{formatFCFA(totalBalance)}</Text>
            <Text className="mt-1 font-body text-[13px] text-ink-muted">
              solde cumulé des carnets suivis
            </Text>
            {lastSyncAt ? (
              <Text className="mt-2 font-body text-[11px] text-ink-faint">
                Dernière synchronisation : {new Date(lastSyncAt).toLocaleTimeString("fr-FR")}
              </Text>
            ) : null}
          </>
        )}
        {error ? (
          <Text className="mt-2 font-body text-[12px] text-danger">{error}</Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => router.push("/(app)/collect")}
        className="mt-6 items-center justify-center rounded-xl bg-primary active:bg-primary-dark"
        style={{ minHeight: 48 }}
      >
        <Text className="font-heading text-[16px] text-white">Encaisser</Text>
      </Pressable>

      <Pressable
        onPress={() => void logout()}
        className="mt-8 items-center justify-center rounded-xl border border-line"
        style={{ minHeight: 48 }}
      >
        <Text className="font-heading text-[16px] text-danger">Se déconnecter</Text>
      </Pressable>
    </ScrollView>
  );
}

function roleLabel(role: string | undefined): string {
  switch (role) {
    case "owner":
      return "Dirigeant";
    case "manager":
      return "Gérant";
    case "agent":
      return "Agent collecteur";
    case "controller":
      return "Contrôleur";
    case "admin":
      return "Administrateur plateforme";
    default:
      return "—";
  }
}
