// TontiHelm mobile — onglet Clôture (phase 2, écart n° 9 du PARITE) : la
// déclaration de caisse de fin de tournée, IDENTIQUE au web (M5) — déclarer ses
// espèces, voir l'écart, attendre la validation gérant qui verrouille la
// journée. Canal : POST /v1/closing (miroir exact des règles de la route web,
// jetons appareil). Règle propre au mobile : on ne déclare que FILE VIDE —
// les encaissements en attente doivent être chez le serveur pour que « espèces
// attendues » soit juste ; hors ligne, l'écran l'explique au lieu d'échouer.
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { colors } from "@/theme/tokens";
import { formatFCFA } from "@tontihelm/domain";
import { useTour } from "@/lib/tour-store";
import { useOutbox } from "@/lib/outbox-store";
import { useSession } from "@/lib/session";
import { ApiClientError } from "@/lib/api";
import { RealtimePill, SyncPill } from "@/components/pills";

export default function ClosingScreen() {
  const ready = useTour((s) => s.ready);
  const summary = useTour((s) => s.summary);
  const closing = useTour((s) => s.closing);
  const refreshing = useTour((s) => s.refreshing);
  const realtime = useTour((s) => s.realtime);
  const refresh = useTour((s) => s.refresh);
  const authedPost = useSession((s) => s.authedPost);

  const online = useOutbox((s) => s.online);
  const pending = useOutbox((s) => s.pending);
  const pendingCash = useOutbox((s) => s.pendingCash);

  const [declaredInput, setDeclaredInput] = useState("");
  const [declaring, setDeclaring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const declared = parseInt(declaredInput || "0", 10) || 0;
  const expectedTotal = summary.expectedCash + pendingCash;
  const provisionalGap = declared - expectedTotal;

  const alreadyDeclared = closing !== null && closing.status !== "open";
  const canDeclare =
    ready &&
    !declaring &&
    !alreadyDeclared &&
    online !== false &&
    pending === 0 &&
    declaredInput !== "" &&
    declared >= 0;

  const declare = async () => {
    if (!canDeclare) return;
    setDeclaring(true);
    setError(null);
    setMessage(null);
    try {
      const body = (await authedPost("/v1/closing", { declaredCash: declared })) as {
        closing?: { status: string; declaredCash: number; expectedCash: number; gap: number };
        message?: string;
      };
      setMessage(body.message ?? "Déclaration enregistrée.");
      // L'état local suit immédiatement (le tirage suivant le confirmera).
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Déclaration impossible. Vérifie ta connexion et réessaie."
      );
    } finally {
      setDeclaring(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentContainerClassName="px-6 pb-10 pt-14"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-title text-[28px] leading-[34px] text-ink">Clôture</Text>
        <View className="flex-row items-center gap-2">
          <SyncPill compact />
          <RealtimePill state={realtime} />
        </View>
      </View>
      <Text className="mt-1 font-body text-base text-ink-muted">
        Déclaration de caisse en fin de tournée — le gérant valide et verrouille la journée.
      </Text>

      {/* Comptes du jour — espèces côté serveur + espèces encore en file */}
      <View className="mt-4 rounded-2xl border border-line p-5">
        <Text className="font-heading text-[16px] text-ink">Journée en cours</Text>
        {!ready ? (
          <Text className="mt-2 font-body text-[14px] text-ink-muted">Chargement…</Text>
        ) : (
          <>
            <View className="mt-3 flex-row gap-2.5">
              <View className="flex-1 rounded-xl bg-[#F4F7FB] px-3 py-2.5">
                <Text className="font-medium text-[10px] uppercase text-ink-muted">Espèces encaissées (serveur)</Text>
                <Text className="mt-0.5 font-semibold text-[15px] text-ink">{formatFCFA(summary.expectedCash)}</Text>
              </View>
              <View className="flex-1 rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.primarySoft }}>
                <Text className="font-medium text-[10px] uppercase text-primary-dark">Mobile money du jour</Text>
                <Text className="mt-0.5 font-semibold text-[15px] text-primary-dark">
                  {formatFCFA(summary.mobileToday)}
                </Text>
              </View>
            </View>
            {pending > 0 ? (
              <Text className="mt-3 font-body text-[12px] leading-[18px] text-warning">
                {pending} encaissement{pending > 1 ? "s" : ""} encore en file ({formatFCFA(pendingCash)} d'espèces) —
                laisse la file partir avant de déclarer : « espèces attendues » doit tout compter.
              </Text>
            ) : null}
          </>
        )}
      </View>

      {/* État de la clôture du jour */}
      {alreadyDeclared ? (
        <View className="mt-4 rounded-2xl border border-line bg-[#F4F7FB] p-5">
          <Text className="font-heading text-[16px] text-ink">
            {closing?.status === "validated" ? "Caisse validée" : "Caisse déclarée"}
          </Text>
          <View className="mt-2 gap-1">
            <Text className="font-body text-[14px] text-ink-muted">
              Espèces déclarées : {formatFCFA(closing?.declaredCash ?? 0)}
            </Text>
            <Text className="font-body text-[14px] text-ink-muted">
              Espèces attendues : {formatFCFA(closing?.expectedCash ?? 0)}
            </Text>
            <Text
              className="font-semibold text-[15px]"
              style={{ color: (closing?.gap ?? 0) === 0 ? colors.primary : colors.danger }}
            >
              Écart : {formatFCFA(Math.abs(closing?.gap ?? 0))}
              {(closing?.gap ?? 0) === 0 ? " — aucun" : (closing?.gap ?? 0) > 0 ? " en trop" : " manquant"}
            </Text>
          </View>
          <Text className="mt-2 font-body text-[12px] leading-[18px] text-ink-muted">
            {closing?.status === "validated"
              ? "Journée verrouillée par le gérant : plus aucun encaissement possible sur ce jour."
              : "En attente de validation par le gérant — il peut contester avec une note."}
          </Text>
        </View>
      ) : (
        <View className="mt-4 rounded-2xl border border-line p-5">
          <Text className="font-heading text-[16px] text-ink">Déclarer ma caisse</Text>
          <Text className="mt-1 font-body text-[12px] leading-[18px] text-ink-muted">
            Compte les espèces en main, tout canal confondu. L'écart avec tes encaissements part au gérant.
          </Text>

          <Text className="mt-3 font-medium text-[11px] uppercase tracking-wide text-ink-muted">
            Espèces déclarées
          </Text>
          <View
            className="mt-1 items-center justify-center rounded-xl border-2"
            style={{
              minHeight: 64,
              backgroundColor: colors.primarySoft,
              borderColor: colors.primary,
            }}
          >
            <TextInput
              value={declaredInput}
              onChangeText={(v) => setDeclaredInput(v.replace(/[^0-9]/g, "").slice(0, 9))}
              placeholder="0"
              placeholderTextColor={colors.inkFaint}
              keyboardType="number-pad"
              className="w-full text-center font-heading text-[34px] text-primary-dark"
              style={{ minHeight: 64 }}
            />
          </View>

          {/* Raccourcis de saisie rapide */}
          <View className="mt-3 flex-row gap-2">
            {["500", "1000", "5000"].map((k) => (
              <Pressable
                key={k}
                onPress={() => setDeclaredInput(String(declared + parseInt(k, 10)))}
                className="flex-1 items-center justify-center rounded-xl border border-line"
                style={{ minHeight: 44 }}
              >
                <Text className="font-heading text-[13px] text-ink">+{k}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setDeclaredInput("")}
              className="items-center justify-center rounded-xl border border-line"
              style={{ minHeight: 44, paddingHorizontal: 14 }}
            >
              <Text className="font-heading text-[13px] text-danger">eff.</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => setDeclaredInput(String(expectedTotal))}
            className="mt-2 items-center rounded-lg py-2"
          >
            <Text className="font-medium text-[12px] text-primary">
              Raccourci : tout déclaré ({formatFCFA(expectedTotal)})
            </Text>
          </Pressable>

          <Text className="mt-3 font-body text-[12px] text-ink-muted">
            Écart prévisionnel :{" "}
            <Text
              className="font-semibold"
              style={{ color: provisionalGap === 0 ? colors.primary : colors.danger }}
            >
              {provisionalGap === 0
                ? "aucun"
                : `${formatFCFA(Math.abs(provisionalGap))} ${provisionalGap > 0 ? "en trop" : "manquant"}`}
            </Text>
            {pendingCash > 0 ? " (espèces en file incluses)" : ""}
          </Text>

          <Pressable
            onPress={() => void declare()}
            disabled={!canDeclare}
            className="mt-4 items-center justify-center rounded-xl"
            style={{ minHeight: 56, backgroundColor: colors.primary, opacity: canDeclare ? 1 : 0.5 }}
          >
            <Text className="font-heading text-[16px] text-white">
              {declaring ? "Déclaration…" : "Déclarer ma caisse"}
            </Text>
          </Pressable>

          {online === false ? (
            <Text className="mt-2 text-center font-body text-[12px] leading-[18px] text-warning">
              Hors ligne — la déclaration exige le réseau : les espèces attendues se calculent côté serveur.
            </Text>
          ) : null}
          {pending > 0 && online !== false ? (
            <Text className="mt-2 text-center font-body text-[12px] leading-[18px] text-warning">
              File non vide ({pending} en attente) — laisse l'envoi finir avant de déclarer.
            </Text>
          ) : null}
        </View>
      )}

      {message ? (
        <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: colors.primarySoft }}>
          <Text className="font-body text-[13px] leading-[19px] text-primary-dark">{message}</Text>
        </View>
      ) : null}
      {error ? (
        <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: "#FDECEA" }}>
          <Text className="font-body text-[13px] leading-[19px] text-danger">{error}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
