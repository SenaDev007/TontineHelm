// TontiHelm mobile — onglet Tournée (phase 2, écart n° 5 du PARITE) : la
// tournée du jour TRIÉE PAR QUARTIER PUIS NOM (même ordre que le web), cartes
// empilées, filtre par quartier, indicateurs du jour (espèces attendues,
// mobile money, solde suivi) et pilules temps réel + synchronisation en
// permanence. Tout vient du miroir local : l'écran marche HORS LIGNE, à la
// fraîcheur du dernier tirage — le moteur rattrape dès le retour du réseau.
// Toucher un arrêt ouvre l'encaissement de CE carnet (mode hors ligne inclus).
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme/tokens";
import { formatFCFA } from "@tontihelm/domain";
import { useTour, todayOf } from "@/lib/tour-store";
import { useOutbox } from "@/lib/outbox-store";
import { RealtimePill, SyncPill } from "@/components/pills";

export default function TourScreen() {
  const router = useRouter();

  const ready = useTour((s) => s.ready);
  const structureName = useTour((s) => s.structureName);
  const agentName = useTour((s) => s.agentName);
  const stops = useTour((s) => s.stops);
  const contributors = useTour((s) => s.contributors);
  const neighborhoods = useTour((s) => s.neighborhoods);
  const summary = useTour((s) => s.summary);
  const closing = useTour((s) => s.closing);
  const lastSyncAt = useTour((s) => s.lastSyncAt);
  const realtime = useTour((s) => s.realtime);
  const error = useTour((s) => s.error);
  const refresh = useTour((s) => s.refresh);
  const refreshing = useTour((s) => s.refreshing);

  const pending = useOutbox((s) => s.pending);
  const online = useOutbox((s) => s.online);

  const [quartier, setQuartier] = useState<string | null>(null);

  // Même tri que le web et l'onglet Encaisser : quartier, puis nom.
  const rows = useMemo(() => {
    return stops
      .filter((s) => s.status === "active" || s.status === "late")
      .map((s) => ({
        stop: s,
        name: contributors.find((c) => c.id === s.contributorId)?.fullName ?? "Cotisant",
        neighborhood: contributors.find((c) => c.id === s.contributorId)?.neighborhood ?? "",
      }))
      .filter((r) => !quartier || r.neighborhood === quartier)
      .sort(
        (a, b) =>
          a.neighborhood.localeCompare(b.neighborhood, "fr") || a.name.localeCompare(b.name, "fr")
      );
  }, [stops, contributors, quartier]);

  const collectableTotal = useMemo(
    () => stops.filter((s) => s.status === "active" || s.status === "late").length,
    [stops]
  );
  const doneCount = useMemo(
    () =>
      stops
        .filter((s) => s.status === "active" || s.status === "late")
        .filter((s) => todayOf(s)).length,
    [stops]
  );
  const totalBalance = useMemo(() => stops.reduce((sum, s) => sum + s.balance, 0), [stops]);

  const openCollect = (passbookId: string) => {
    router.push({ pathname: "/(app)/collect", params: { passbook: passbookId } });
  };

  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentContainerClassName="px-6 pb-10 pt-14"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-title text-[28px] leading-[34px] text-ink">Tournée</Text>
        <View className="flex-row items-center gap-2">
          <SyncPill />
          <RealtimePill state={realtime} />
        </View>
      </View>
      <Text className="mt-1 font-body text-base text-ink-muted">
        {structureName ? `${structureName} · ${agentName}` : "Chargement de la tournée…"}
      </Text>

      {/* Indicateurs du jour — servis par le miroir, rafraîchis en temps réel */}
      <View className="mt-4 rounded-2xl border border-line p-5">
        <View className="flex-row items-baseline justify-between">
          <Text className="font-heading text-[16px] text-ink">Journée en cours</Text>
          {lastSyncAt ? (
            <Text className="font-body text-[11px] text-ink-faint">
              sync {new Date(lastSyncAt).toLocaleTimeString("fr-FR")}
            </Text>
          ) : null}
        </View>
        {!ready ? (
          <Text className="mt-2 font-body text-[14px] text-ink-muted">Chargement…</Text>
        ) : (
          <>
            <View className="mt-3 flex-row gap-2.5">
              <View className="flex-1 rounded-xl bg-[#F4F7FB] px-3 py-2.5">
                <Text className="font-medium text-[10px] uppercase text-ink-muted">Espèces attendues</Text>
                <Text className="mt-0.5 font-semibold text-[15px] text-ink">{formatFCFA(summary.expectedCash)}</Text>
              </View>
              <View className="flex-1 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.primarySoft }}>
                <Text className="font-medium text-[10px] uppercase text-primary-dark">Mobile money du jour</Text>
                <Text className="mt-0.5 font-semibold text-[15px] text-primary-dark">
                  {formatFCFA(summary.mobileToday)}
                </Text>
              </View>
            </View>
            <View className="mt-2.5 flex-row gap-2.5">
              <View className="flex-1 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.goldSoft }}>
                <Text className="font-medium text-[10px] uppercase text-warning">Carnets à encaisser</Text>
                <Text className="mt-0.5 font-semibold text-[15px] text-warning">
                  {collectableTotal - doneCount} / {collectableTotal}
                </Text>
              </View>
              <View className="flex-1 rounded-xl border border-line px-3 py-2.5">
                <Text className="font-medium text-[10px] uppercase text-ink-muted">Solde suivi</Text>
                <Text className="mt-0.5 font-semibold text-[15px] text-ink">{formatFCFA(totalBalance)}</Text>
              </View>
            </View>
          </>
        )}
        {pending > 0 ? (
          <Text className="mt-3 font-body text-[12px] leading-[18px] text-warning">
            {pending} encaissement{pending > 1 ? "s" : ""} en attente d'envoi —{" "}
            {online === false ? "réseau absent, envoi automatique au retour." : "envoi en cours…"}
          </Text>
        ) : null}
        {error ? <Text className="mt-2 font-body text-[12px] text-danger">{error}</Text> : null}
      </View>

      {closing?.status === "validated" ? (
        <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: colors.goldSoft }}>
          <Text className="font-body text-[14px] leading-[20px] text-warning">
            Clôture validée : les encaissements du jour sont verrouillés.
          </Text>
        </View>
      ) : closing?.status === "declared" ? (
        <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: "#F4F7FB" }}>
          <Text className="font-body text-[14px] leading-[20px] text-ink-muted">
            Caisse du jour déclarée — en attente de validation par le gérant.
          </Text>
        </View>
      ) : null}

      {/* Filtre par quartier — même découpage que la tournée web */}
      {neighborhoods.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 16 }}>
          {[null, ...neighborhoods].map((q) => {
            const active = quartier === q;
            return (
              <Pressable
                key={q ?? "__tous"}
                onPress={() => setQuartier(q)}
                className="items-center justify-center rounded-full border px-4"
                style={{
                  minHeight: 36,
                  backgroundColor: active ? colors.primary : "#FFFFFF",
                  borderColor: active ? colors.primary : colors.line,
                }}
              >
                <Text className="font-medium text-[12px]" style={{ color: active ? "#FFFFFF" : colors.ink }}>
                  {q ?? "Tous les quartiers"}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Arrêts — cartes empilées, tri quartier puis nom */}
      <View className="mt-4 gap-3">
        {rows.map(({ stop: s, name, neighborhood }) => {
          const today = todayOf(s);
          return (
            <Pressable
              key={s.passbookId}
              onPress={() => openCollect(s.passbookId)}
              className="rounded-2xl border border-line bg-paper p-4 active:bg-[#F0F5FC]"
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="items-center justify-center rounded-xl"
                  style={{ backgroundColor: "#EDF2F7", width: 44, height: 44 }}
                >
                  <Text className="font-heading text-[13px] text-ink">{s.passbookNumber}</Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-heading text-[15px] text-ink" numberOfLines={1}>
                    {name}
                  </Text>
                  <Text className="mt-0.5 font-body text-[12px] text-ink-muted" numberOfLines={1}>
                    {neighborhood || "—"} · F{s.livret.currentSheet}/{s.livret.months ?? 12} · L
                    {s.livret.dueLineInSheet} · {formatFCFA(s.dailyAmount)}
                  </Text>
                </View>
                <View className="items-end gap-1">
                  <View
                    className="rounded-full px-2.5 py-1"
                    style={{ backgroundColor: s.status === "late" ? "#FDECEA" : colors.primarySoft }}
                  >
                    <Text
                      className="font-medium text-[11px]"
                      style={{ color: s.status === "late" ? colors.danger : colors.primaryDark }}
                    >
                      {s.statusLabel}
                    </Text>
                  </View>
                  <Text className="font-medium text-[12px] text-ink">
                    {today ? `+ ${formatFCFA(today.amount)} aujourd'hui` : formatFCFA(s.balance)}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
        {ready && rows.length === 0 ? (
          <View className="rounded-2xl border border-line p-6">
            <Text className="text-center font-body text-[14px] text-ink-muted">
              {quartier
                ? `Aucun carnet actif à ${quartier}.`
                : "Aucun carnet actif dans ta tournée."}
            </Text>
          </View>
        ) : null}
        {ready && collectableTotal === 0 && !quartier ? (
          <Text className="text-center font-body text-[12px] leading-[18px] text-ink-muted">
            Ton portefeuille est vide d'encaissement aujourd'hui — l'onglet Clients liste toute ta clientèle.
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
