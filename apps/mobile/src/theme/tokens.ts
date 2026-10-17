// TontiHelm mobile — jetons de design centralisés (brief : #0F6B4A / #C8962E,
// Plus Jakarta Sans + Inter, cibles tactiles 48 dp, aucun emoji).
// tailwind.config.js expose les mêmes valeurs ; ce module sert aux styles
// impératifs (en-têtes natifs, splash, états) et à la documentation vivante.
export const colors = {
  primary: "#0F6B4A",
  primaryDark: "#0B5238",
  primaryLight: "#14855D",
  primarySoft: "#E7F2ED",
  gold: "#C8962E",
  goldSoft: "#F7EDD8",
  paper: "#FFFFFF",
  ink: "#15201B",
  inkMuted: "#5B6B63",
  inkFaint: "#8CA096",
  danger: "#B3261E",
  warning: "#9A6700",
  line: "#DCE5E0",
} as const;

/** Cible tactile minimale (brief : 48 dp) — à appliquer aux boutons et champs. */
export const TOUCH_TARGET = 48;

/** Vibration courte de confirmation d'encaissement (brief : 60 ms). */
export const HAPTIC_MS = 60;

export const type = {
  screenTitle: { fontFamily: "PlusJakartaSans-ExtraBold", fontSize: 28, lineHeight: 34 },
  sectionTitle: { fontFamily: "PlusJakartaSans-Bold", fontSize: 18, lineHeight: 24 },
  body: { fontFamily: "Inter-Regular", fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: "Inter-Regular", fontSize: 13, lineHeight: 18 },
} as const;
