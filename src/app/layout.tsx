import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#003887",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  title: "TontiHelm : application de gestion de tontine au Bénin",
  description:
    "Remplace le carnet papier par une application qui marche sans réseau. Encaissement en 10 secondes, carnet client en ligne, caisse clôturée chaque soir. Essaie la démonstration en direct.",
  keywords: [
    "application gestion tontine",
    "application tontine Bénin",
    "application microfinance Bénin",
    "carnet de collecte numérique",
  ],
  icons: {
    // Le SVG officiel est une version monochrome noire : on ne le référence PAS
    // (le navigateur privilégie le SVG s'il est déclaré → silhouette noire
    // dans l'onglet). Les PNG plein cadre rendent l'emblème coloré reconnaissable.
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "TontiHelm : application de gestion de tontine au Bénin",
    description:
      "Remplace le carnet papier par une application qui marche sans réseau. Encaissement en 10 secondes, carnet client en ligne, caisse clôturée chaque soir. Essaie la démonstration en direct.",
    type: "website",
    locale: "fr_BJ",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} ${jakarta.variable} antialiased bg-canvas text-ink`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
