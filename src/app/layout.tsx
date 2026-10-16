import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "TontiHelm : logiciel de gestion de tontine au Bénin",
  description:
    "Remplace le carnet papier par une app qui marche sans réseau. Encaissement en 10 secondes, caisse clôturée chaque soir. Essai gratuit 60 jours.",
  keywords: [
    "logiciel gestion tontine",
    "application tontine Bénin",
    "logiciel microfinance Bénin",
    "carnet de collecte numérique",
  ],
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "TontiHelm : logiciel de gestion de tontine au Bénin",
    description:
      "Remplace le carnet papier par une app qui marche sans réseau. Encaissement en 10 secondes, caisse clôturée chaque soir. Essai gratuit 60 jours.",
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
