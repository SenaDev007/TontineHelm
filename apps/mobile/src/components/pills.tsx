// TontiHelm mobile — pastilles d'en-tête partagées (phase 2) : temps réel
// (flux SSE) et synchronisation (état réseau + file d'envoi en attente).
// Toujours lisibles, jamais verbeales : l'agent sait d'un coup d'œil si ce
// qu'il voit est vivant, en attente, ou hors ligne.
import { Text, View } from "react-native";
import { colors } from "@/theme/tokens";
import { useTour } from "@/lib/tour-store";
import { useOutbox } from "@/lib/outbox-store";

export function RealtimePill({ state }: { state: "connecting" | "open" | "reconnecting" }) {
  const label = state === "open" ? "Temps réel actif" : state === "connecting" ? "Connexion…" : "Reconnexion…";
  const color = state === "open" ? colors.primary : colors.warning;
  return (
    <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.goldSoft }}>
      <Text className="font-medium text-[11px]" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Pilule de synchronisation (écart n° 7 : indicateur PERMANENT) : hors ligne /
 * en ligne / N en attente. En attente = écritures de la file non confirmées —
 * elles partiront seules à la cadence 2/4/8/16 s puis 5 min.
 */
export function SyncPill({ compact = false }: { compact?: boolean }) {
  const online = useOutbox((s) => s.online);
  const pending = useOutbox((s) => s.pending);
  const realtime = useTour((s) => s.realtime);

  let label: string;
  let color: string;
  if (online === false) {
    label = "Hors ligne";
    color = colors.warning;
  } else if (pending > 0) {
    label = `${pending} en attente`;
    color = colors.warning;
  } else if (realtime === "open") {
    label = compact ? "À jour" : "Synchronisé";
    color = colors.primary;
  } else {
    label = "Connexion…";
    color = colors.warning;
  }

  return (
    <View
      className="rounded-full px-3 py-1"
      style={{ backgroundColor: pending > 0 || online === false ? colors.goldSoft : colors.primarySoft }}
    >
      <Text className="font-medium text-[11px]" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
