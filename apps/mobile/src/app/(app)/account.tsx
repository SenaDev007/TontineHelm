// TontiHelm mobile — onglet Compte (phase 2, écarts n° 7/§8.5 du PARITE) :
// profil, structure et appareil ; panneau de synchronisation (état réseau,
// file d'envoi, dernier envoi, reprise MANUELLE) ; ÉCRAN DE REPRISE des rejets
// — chaque écriture refusée par le serveur garde son motif, l'agent la relit
// puis la met de côté ; déconnexion qui purge les données locales (miroir
// chiffré + file), comme le web supprime son localStorage.
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/theme/tokens";
import { formatFCFA } from "@tontihelm/domain";
import { useSession } from "@/lib/session";
import { useTour } from "@/lib/tour-store";
import { useOutbox } from "@/lib/outbox-store";
import { RealtimePill } from "@/components/pills";

export default function AccountScreen() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const device = useSession((s) => s.device);
  const status = useSession((s) => s.status);
  const logout = useSession((s) => s.logout);

  const structureName = useTour((s) => s.structureName);
  const lastSyncAt = useTour((s) => s.lastSyncAt);
  const realtime = useTour((s) => s.realtime);

  const online = useOutbox((s) => s.online);
  const pending = useOutbox((s) => s.pending);
  const pendingCash = useOutbox((s) => s.pendingCash);
  const flushing = useOutbox((s) => s.flushing);
  const rejected = useOutbox((s) => s.rejected);
  const blocked = useOutbox((s) => s.blocked);
  const lastPushAt = useOutbox((s) => s.lastPushAt);
  const syncNow = useOutbox((s) => s.syncNow);
  const dismissRejected = useOutbox((s) => s.dismissRejected);
  const resetOutbox = useOutbox((s) => s.reset);
  const purgeLocal = useTour((s) => s.purgeLocal);

  const [busy, setBusy] = useState(false);

  // Déconnexion → retour à l'écran de connexion.
  useEffect(() => {
    if (status === "anonymous") router.replace("/(auth)/login");
  }, [status, router]);

  const runSync = async () => {
    if (busy || flushing) return;
    setBusy(true);
    try {
      await syncNow();
    } finally {
      setBusy(false);
    }
  };

  const confirmDismiss = (id: string) => {
    Alert.alert(
      "Mettre de côté cette écriture ?",
      "Elle n'existe pas au serveur (refus définitif). Elle disparaît de la file — si le cotisant a bien payé, saisis un nouvel encaissement corrigé.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Mettre de côté", style: "destructive", onPress: () => void dismissRejected(id) },
      ]
    );
  };

  const confirmLogout = () => {
    Alert.alert("Se déconnecter ?", "Les données locales (tournée et file d'envoi) seront effacées de ce téléphone.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Se déconnecter",
        style: "destructive",
        onPress: () => void doLogout(),
      },
    ]);
  };

  const doLogout = async () => {
    await purgeLocal(); // miroir chiffré + file d'envoi
    resetOutbox();
    await logout(); // jetons + coffre (re-purge localement par sécurité)
  };

  return (
    <ScrollView className="flex-1 bg-paper" contentContainerClassName="px-6 pb-10 pt-14">
      <View className="flex-row items-center justify-between">
        <Text className="font-title text-[28px] leading-[34px] text-ink">Compte</Text>
        <RealtimePill state={realtime} />
      </View>

      {/* Profil */}
      <View className="mt-4 rounded-2xl bg-primary-soft p-5">
        <Text className="font-heading text-[16px] text-primary-dark">{user?.fullName ?? "—"}</Text>
        <Text className="mt-1 font-body text-[14px] text-ink">
          {user?.phone} · Agent collecteur
        </Text>
        <Text className="mt-1 font-body text-[14px] text-ink-muted">
          {structureName || user?.structureName || "Aucune structure"}
        </Text>
        <View className="mt-3 flex-row items-center gap-2">
          <View className="rounded-full bg-gold-soft px-3 py-1">
            <Text className="font-medium text-[12px] text-ink">{device?.label ?? "—"}</Text>
          </View>
          <View className="rounded-full bg-[#EDF2F7] px-3 py-1">
            <Text className="font-medium text-[11px] text-ink-muted">appareil enregistré</Text>
          </View>
        </View>
      </View>

      {/* Synchronisation */}
      <View className="mt-4 rounded-2xl border border-line p-5">
        <View className="flex-row items-center justify-between">
          <Text className="font-heading text-[16px] text-ink">Synchronisation</Text>
          <View
            className="rounded-full px-3 py-1"
            style={{ backgroundColor: online === false ? colors.goldSoft : colors.primarySoft }}
          >
            <Text
              className="font-medium text-[11px]"
              style={{ color: online === false ? colors.warning : colors.primary }}
            >
              {online === false ? "Hors ligne" : online === true ? "En ligne" : "Réseau…"}
            </Text>
          </View>
        </View>

        <View className="mt-3 gap-1">
          <Text className="font-body text-[14px] text-ink-muted">
            File d'envoi :{" "}
            <Text className="font-semibold" style={{ color: pending > 0 ? colors.warning : colors.primaryDark }}>
              {pending} écriture{pending > 1 ? "s" : ""}
              {pendingCash > 0 ? ` · ${formatFCFA(pendingCash)} d'espèces` : ""}
            </Text>
          </Text>
          <Text className="font-body text-[14px] text-ink-muted">
            Dernier envoi : {lastPushAt ? new Date(lastPushAt).toLocaleTimeString("fr-FR") : "—"}
          </Text>
          <Text className="font-body text-[14px] text-ink-muted">
            Dernier tirage : {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString("fr-FR") : "—"}
          </Text>
        </View>

        {blocked ? (
          <View className="mt-3 rounded-xl px-4 py-3" style={{ backgroundColor: "#FDECEA" }}>
            <Text className="font-body text-[13px] leading-[19px] text-danger">
              Hors ligne depuis plus de 7 jours — les nouvelles saisies sont bloquées. Reconnecte-toi
              et laisse la file partir.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => void runSync()}
          disabled={busy || flushing}
          className="mt-4 items-center justify-center rounded-xl border border-line"
          style={{ minHeight: 48, opacity: busy || flushing ? 0.6 : 1 }}
        >
          <Text className="font-heading text-[15px] text-primary">
            {busy || flushing ? "Synchronisation…" : "Synchroniser maintenant"}
          </Text>
        </Pressable>
        <Text className="mt-2 text-center font-body text-[11px] leading-[17px] text-ink-faint">
          Traction des données de référence + envoi de la file — sinon automatique : temps réel,
          filet 30 s, retour du réseau et du premier plan, reprise 2/4/8/16 s puis 5 min.
        </Text>
      </View>

      {/* Écran de reprise : rejets définitifs à relire (écart n° 7) */}
      {rejected.length > 0 ? (
        <View className="mt-4 rounded-2xl border border-line p-5">
          <Text className="font-heading text-[16px] text-danger">
            {rejected.length} écriture{rejected.length > 1 ? "s" : ""} refusée{rejected.length > 1 ? "s" : ""}
          </Text>
          <Text className="mt-1 font-body text-[12px] leading-[18px] text-ink-muted">
            Le serveur a rejeté ces encaissements pour un motif définitif (jour verrouillé, carnet
            clos, montant invalide…). Relis-les, corrige par un nouvel encaissement si le cotisant a
            bien payé, puis mets-les de côté.
          </Text>
          <View className="mt-3 gap-2.5">
            {rejected.map((r) => (
              <View key={r.id} className="rounded-xl border border-line bg-[#FDF4F3] px-3 py-2.5">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="font-heading text-[14px] text-ink">
                    {formatFCFA(r.amount)} · carnet {r.passbookNumber}
                  </Text>
                  <Text className="font-body text-[11px] text-ink-faint">
                    {new Date(r.collectedAt).toLocaleTimeString("fr-FR")}
                  </Text>
                </View>
                <Text className="mt-1 font-body text-[12px] leading-[18px] text-danger">{r.message}</Text>
                <Pressable
                  onPress={() => confirmDismiss(r.id)}
                  className="mt-2 items-center justify-center rounded-lg border border-line"
                  style={{ minHeight: 38, backgroundColor: "#FFFFFF" }}
                >
                  <Text className="font-medium text-[12px] text-danger">Mettre de côté</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Déconnexion */}
      <Pressable
        onPress={confirmLogout}
        className="mt-6 items-center justify-center rounded-xl border border-line"
        style={{ minHeight: 48 }}
      >
        <Text className="font-heading text-[16px] text-danger">Se déconnecter</Text>
      </Pressable>
      <Text className="mt-2 text-center font-body text-[11px] leading-[17px] text-ink-faint">
        Déconnexion = purge du téléphone : tournée miroir, file d'envoi et jetons disparaissent.
      </Text>
    </ScrollView>
  );
}
