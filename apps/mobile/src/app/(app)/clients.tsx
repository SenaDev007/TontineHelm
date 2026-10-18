// TontiHelm mobile — onglet Clients (phase 2, écart n° 8 du PARITE) : le
// PORTFEUILLE COMPLET de l'agent, TOUS carnets par client (archive comprise,
// comme l'écran Clients du web), recherche instantanée nom/téléphone, quartiers
// — servi par le miroir local donc lisible HORS LIGNE. « Encaisser sur ce
// carnet » ouvre l'onglet Encaisser ciblé (file hors ligne incluse).
// La création de client (web : POST /api/agent/clients) attend le canal /v1
// correspondant — planifié phase 3 avec les écrans gérant.
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme/tokens";
import { formatFCFA } from "@tontihelm/domain";
import { useTour, todayOf } from "@/lib/tour-store";
import { useOutbox } from "@/lib/outbox-store";
import { RealtimePill, SyncPill } from "@/components/pills";

export default function ClientsScreen() {
  const router = useRouter();

  const ready = useTour((s) => s.ready);
  const structureName = useTour((s) => s.structureName);
  const stops = useTour((s) => s.stops);
  const contributors = useTour((s) => s.contributors);
  const refreshing = useTour((s) => s.refreshing);
  const realtime = useTour((s) => s.realtime);
  const refresh = useTour((s) => s.refresh);

  const online = useOutbox((s) => s.online);

  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const rows = useMemo(() => {
    return contributors
      .map((c) => ({
        contributor: c,
        passbooks: stops.filter((s) => s.contributorId === c.id),
      }))
      .filter(({ contributor, passbooks }) => {
        if (!needle) return true;
        const inName = contributor.fullName.toLowerCase().includes(needle);
        const inPhone = (contributor.phone ?? "").includes(needle);
        const inNumber = passbooks.some((s) => s.passbookNumber.includes(needle));
        return inName || inPhone || inNumber;
      })
      .sort((a, b) => a.contributor.fullName.localeCompare(b.contributor.fullName, "fr"));
  }, [contributors, stops, needle]);

  const openCollect = (passbookId: string) => {
    router.push({ pathname: "/(app)/collect", params: { passbook: passbookId } });
  };

  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentContainerClassName="px-6 pb-10 pt-14"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-title text-[28px] leading-[34px] text-ink">Clients</Text>
        <View className="flex-row items-center gap-2">
          <SyncPill compact />
          <RealtimePill state={realtime} />
        </View>
      </View>
      <Text className="mt-1 font-body text-base text-ink-muted">
        {ready
          ? `${contributors.length} client${contributors.length > 1 ? "s" : ""} dans ton portefeuille${structureName ? ` · ${structureName}` : ""}.`
          : "Chargement du portefeuille…"}
      </Text>

      {/* Recherche instantanée — hors ligne, sur le miroir local */}
      <View className="mt-4 flex-row items-center rounded-xl border border-line bg-[#F4F7FB] px-4" style={{ minHeight: 48 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Nom, téléphone ou n° de carnet"
          placeholderTextColor={colors.inkFaint}
          className="flex-1 font-body text-[15px] text-ink"
          autoCorrect={false}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} className="ml-2 px-2 py-2">
            <Text className="font-medium text-[13px] text-primary">eff.</Text>
          </Pressable>
        ) : null}
      </View>

      {online === false ? (
        <View className="mt-3 rounded-xl px-4 py-3" style={{ backgroundColor: colors.goldSoft }}>
          <Text className="font-body text-[12px] leading-[18px] text-warning">
            Hors ligne — portefeuille à la fraîcheur du dernier tirage, encaissements possibles.
          </Text>
        </View>
      ) : null}

      <View className="mt-4 gap-3">
        {rows.map(({ contributor, passbooks }) => (
          <View key={contributor.id} className="rounded-2xl border border-line bg-paper p-4">
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="font-heading text-[16px] text-ink" numberOfLines={1}>
                  {contributor.fullName}
                </Text>
                <Text className="mt-0.5 font-body text-[12px] text-ink-muted" numberOfLines={1}>
                  {contributor.neighborhood || "—"}
                  {contributor.phone ? ` · ${contributor.phone}` : ""}
                </Text>
              </View>
              <View className="rounded-full bg-[#EDF2F7] px-2.5 py-1">
                <Text className="font-medium text-[11px] text-ink">
                  {passbooks.length} carnet{passbooks.length > 1 ? "s" : ""}
                </Text>
              </View>
            </View>

            {passbooks.map((s) => {
              const today = todayOf(s);
              const active = s.status === "active" || s.status === "late";
              return (
                <View key={s.passbookId} className="mt-3 rounded-xl border border-line px-3 py-2.5">
                  <View className="flex-row items-center gap-3">
                    <View
                      className="items-center justify-center rounded-lg"
                      style={{ backgroundColor: "#EDF2F7", width: 40, height: 40 }}
                    >
                      <Text className="font-heading text-[12px] text-ink">{s.passbookNumber}</Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-heading text-[13px] text-ink" numberOfLines={1}>
                        {s.passbookLabel ?? "Carnet"} · {formatFCFA(s.dailyAmount)}/jour
                      </Text>
                      <Text className="mt-0.5 font-body text-[11px] text-ink-muted" numberOfLines={1}>
                        {s.statusLabel} · solde {formatFCFA(s.balance)}
                        {today ? ` · + ${formatFCFA(today.amount)} aujourd'hui` : ""}
                      </Text>
                    </View>
                    {active ? (
                      <Pressable
                        onPress={() => openCollect(s.passbookId)}
                        className="items-center justify-center rounded-lg"
                        style={{ backgroundColor: colors.primary, minWidth: 48, minHeight: 40, paddingHorizontal: 12 }}
                      >
                        <Text className="font-heading text-[12px] text-white">Encaisser</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
        {ready && rows.length === 0 ? (
          <View className="rounded-2xl border border-line p-6">
            <Text className="text-center font-body text-[14px] text-ink-muted">
              {needle ? `Aucun client ne correspond à « ${search} ».` : "Ton portefeuille est vide."}
            </Text>
          </View>
        ) : null}
      </View>

      <Text className="mt-4 text-center font-body text-[11px] leading-[17px] text-ink-faint">
        Liste complète (carnets actifs et archive) servie par le miroir local — la création de client
        se fait depuis le web et arrive au canal mobile en phase 3.
      </Text>
    </ScrollView>
  );
}
