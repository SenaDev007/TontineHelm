// TontiHelm mobile — pile applicative (phase 2) : la BARRE AGENT À 5 ENTRÉES
// du brief — Tournée, Encaisser, Clients, Clôture, Compte — comme la PWA web
// (AgentApp). Deux moteurs tournent en dessous : le tireur temps réel (flux
// SSE /v1/events + filet 30 s + premier plan — tour-engine) et le pousseur de
// file hors ligne (reprise 2/4/8/16 s puis 5 min, retour du réseau, premier
// plan — outbox-engine). Les écrans back-office gérant arrive en phase 3+.
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/tokens";
import { TourEngine } from "@/lib/tour-engine";
import { OutboxEngine } from "@/lib/outbox-engine";

export default function AppLayout() {
  return (
    <>
      <TourEngine />
      <OutboxEngine />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: "#FFFFFF" },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.inkFaint,
          tabBarStyle: {
            backgroundColor: "#FFFFFF",
            borderTopColor: colors.line,
            borderTopWidth: 1,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Tournée",
            tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="collect"
          options={{
            title: "Encaisser",
            tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="clients"
          options={{
            title: "Clients",
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="closing"
          options={{
            title: "Clôture",
            tabBarIcon: ({ color, size }) => <Ionicons name="lock-closed-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: "Compte",
            tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}
