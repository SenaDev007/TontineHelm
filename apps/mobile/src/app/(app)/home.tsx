// TontiHelm mobile — accueil du socle phase 1 : carte de session (utilisateur,
// structure, appareil), sonde de bout en bout vers /v1/sync/pull (mode full),
// déconnexion. Les écrans métier arrivent en phase 2 (PARITE.md §5).
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { colors } from "@/theme/tokens";
import { useSession } from "@/lib/session";
import { ApiClientError } from "@/lib/api";
import { formatFCFA } from "@tontihelm/domain";

interface PullSummary {
  mode: string;
  structure: { name: string };
  passbooks: { passbookId: string; balance: number }[];
  collections: { amount: number }[];
  summary: { expectedCash: number; mobileToday: number };
}

export default function HomeScreen() {
  const user = useSession((s) => s.user);
  const device = useSession((s) => s.device);
  const logout = useSession((s) => s.logout);
  const authedGet = useSession((s) => s.authedGet);
  const [probe, setProbe] = useState<PullSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runProbe = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = await authedGet("/v1/sync/pull");
      setProbe(body as unknown as PullSummary);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Synchronisation impossible. Réessaie.");
    } finally {
      setBusy(false);
    }
  };

  const totalBalance = probe?.passbooks?.reduce((s, p) => s + p.balance, 0) ?? 0;

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-6 pb-10 pt-16"
      refreshControl={
        <RefreshControl refreshing={busy} onRefresh={runProbe} tintColor={colors.primary} />
      }
    >
      <Text className="font-title text-[28px] leading-[34px] text-ink">TontiHelm</Text>
      <Text className="mt-1 font-body text-base text-ink-muted">
        Socle phase 1 — écrans métier à venir.
      </Text>

      <View className="mt-6 rounded-2xl bg-primary-soft p-5">
        <Text className="font-heading text-[16px] text-primary-dark">
          {user?.fullName ?? "—"}
        </Text>
        <Text className="mt-1 font-body text-[14px] text-ink">
          {user?.phone} · {roleLabel(user?.role)}
        </Text>
        <Text className="mt-1 font-body text-[14px] text-ink-muted">
          {user?.structureName ?? "Aucune structure"}
        </Text>
        <View className="mt-3 flex-row items-center">
          <View className="rounded-full bg-gold-soft px-3 py-1">
            <Text className="font-medium text-[12px] text-ink">{device?.label ?? "—"}</Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={runProbe}
        disabled={busy}
        className="mt-6 items-center justify-center rounded-xl bg-primary active:bg-primary-dark"
        style={{ minHeight: 48, opacity: busy ? 0.6 : 1 }}
      >
        <Text className="font-heading text-[16px] text-white">
          {busy ? "Synchronisation…" : "Tester la synchronisation"}
        </Text>
      </Pressable>

      {error ? (
        <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: "#FDECEA" }}>
          <Text className="font-body text-[14px] leading-[20px] text-danger">{error}</Text>
        </View>
      ) : null}

      {probe ? (
        <View className="mt-4 rounded-2xl border border-line p-5">
          <Text className="font-heading text-[16px] text-ink">
            Traction {probe.mode === "full" ? "complète" : "incrémentale"}
          </Text>
          <Text className="mt-2 font-body text-[14px] text-ink-muted">
            Structure : {probe.structure?.name ?? "—"}
          </Text>
          <Text className="mt-1 font-body text-[14px] text-ink-muted">
            Carnets suivis : {probe.passbooks?.length ?? 0}
          </Text>
          <Text className="mt-1 font-body text-[14px] text-ink-muted">
            Écritures reçues : {probe.collections?.length ?? 0}
          </Text>
          <Text className="mt-3 font-semibold text-[18px] text-primary">
            {formatFCFA(totalBalance)}
          </Text>
          <Text className="mt-1 font-body text-[13px] text-ink-muted">
            solde cumulé des carnets de la tournée
          </Text>
        </View>
      ) : null}

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
