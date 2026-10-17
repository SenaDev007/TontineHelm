// TontiHelm mobile — marque typographique (socle) : « Tonti » en vert, « Helm »
// en or, point de séparation or. Version définitive du logo à déposer dans
// assets/ (phase 6, distribution) — aucun emoji, jamais.
import { Text, View } from "react-native";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <View className="flex-row items-baseline">
      <Text className="font-title text-primary" style={{ fontSize: compact ? 20 : 26 }}>
        Tonti
      </Text>
      <View
        className="mx-1 rounded-full bg-gold"
        style={{ width: compact ? 5 : 6, height: compact ? 5 : 6 }}
      />
      <Text className="font-title text-gold" style={{ fontSize: compact ? 20 : 26 }}>
        Helm
      </Text>
    </View>
  );
}
