/** @type {import('tailwindcss').Config} */
// TontiHelm mobile — jetons de design du brief : vert #0F6B4A, or #C8962E,
// Plus Jakarta Sans (titres) / Inter (corps), cibles tactiles 48 dp minimum.
// Aucun emoji, jamais (règle de marque du brief mobile).
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0F6B4A",
          dark: "#0B5238",
          light: "#14855D",
          soft: "#E7F2ED"
        },
        gold: {
          DEFAULT: "#C8962E",
          soft: "#F7EDD8"
        },
        paper: "#FFFFFF",
        ink: {
          DEFAULT: "#15201B",
          muted: "#5B6B63",
          faint: "#8CA096"
        },
        danger: "#B3261E",
        warning: "#9A6700",
        success: "#0F6B4A",
        line: "#DCE5E0"
      },
      fontFamily: {
        title: ["PlusJakartaSans_800ExtraBold", "PlusJakartaSans_700Bold"],
        heading: ["PlusJakartaSans_700Bold", "PlusJakartaSans_600SemiBold"],
        body: ["Inter_400Regular"],
        medium: ["Inter_500Medium"],
        semibold: ["Inter_600SemiBold"]
      }
    }
  },
  plugins: []
};
