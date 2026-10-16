"use client";
// TontiHelm — MVP de gestion de tontines journalières (YEHI OR Tech, Bénin).
// Routeur principal : site vitrine sur /, application selon le rôle connecté.
// Connexion et inscription sont de VRAIES routes (/connexion, /inscription) —
// chaque page a une adresse partageable, marquable et servie hors ligne par le SW.
import { useCallback, useEffect, useState } from "react";
import { Navbar } from "@/components/tontihelm/landing/Navbar";
import { Hero } from "@/components/tontihelm/landing/Hero";
import { Stats } from "@/components/tontihelm/landing/Stats";
import { Problem, Features, Method, Trust } from "@/components/tontihelm/landing/Sections";
import { Pricing } from "@/components/tontihelm/landing/Pricing";
import { Faq, FinalCta } from "@/components/tontihelm/landing/Faq";
import { DemoSection } from "@/components/tontihelm/landing/DemoSection";
import { Footer } from "@/components/tontihelm/landing/Footer";
import { PendingScreen } from "@/components/tontihelm/auth/PendingScreen";
import { AgentApp } from "@/components/tontihelm/agent/AgentApp";
import { ManagerApp } from "@/components/tontihelm/manager/ManagerApp";
import { AdminApp } from "@/components/tontihelm/admin/AdminApp";
import { LogoAnimated } from "@/components/tontihelm/Logo";
import { OfflineLayer } from "@/components/offline/OfflineLayer";
import { clearOfflineData, get, post, setToken } from "@/lib/client";
import { SessionUser, SubscriptionInfo } from "@/lib/types";

/** Défilement doux vers la section Démonstration (pas de mode gratuit : démo accompagnée). */
function scrollToDemo() {
  document.getElementById("demonstration")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function TontiHelmApp() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);

  // Reprise de session au chargement (la connexion elle-même se fait sur /connexion).
  useEffect(() => {
    get<{ user: SessionUser | null; subscription: SubscriptionInfo | null }>("/api/auth/me")
      .then((d) => {
        setUser(d.user);
        setSubscription(d.subscription);
      })
      .catch(() => undefined)
      .finally(() => setBooting(false));
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await post("/api/auth/logout", {});
    } catch {
      /* la session expire de toute façon */
    }
    setToken(null);
    // Purge des données locales (cache IndexedDB + file d'envoi) : isolation par compte.
    void clearOfflineData();
    setUser(null);
    setSubscription(null);
  }, []);

  let content: React.ReactNode;

  if (booting) {
    content = (
      <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-live="polite">
        <div className="text-center animate-fade-in">
          <div className="flex justify-center">
            <LogoAnimated size={96} />
          </div>
          {/* Barre de progression indéterminée (shimmer aux couleurs de marque). */}
          <div className="mx-auto mt-8 h-1.5 w-44 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="shimmer-bar h-full w-full" />
          </div>
          <p className="mt-4 text-sm text-subtle animate-pulse-soft">Chargement de TontiHelm…</p>
        </div>
      </div>
    );
  } else if (user) {
    // ── Utilisateur connecté ──
    if (user.tenantId && user.structureStatus !== "active") {
      // Structure en attente de validation ou suspendue : écran d'attente.
      content = <PendingScreen user={user} onLogout={handleLogout} />;
    } else if (user.role === "admin") {
      content = <AdminApp onLogout={handleLogout} />;
    } else if (user.role === "agent") {
      content = <AgentApp user={user} onLogout={handleLogout} />;
    } else {
      content = <ManagerApp user={user} subscription={subscription} onLogout={handleLogout} />;
    }
  } else {
    // ── Visiteur non connecté : site vitrine ──
    content = (
      <div className="flex min-h-screen flex-col bg-canvas">
        <Navbar onDemoRequest={scrollToDemo} />
        <main className="flex-1">
          <Hero onDemoRequest={scrollToDemo} />
          <Stats />
          <Problem />
          <Features />
          <Method />
          <Trust />
          <Pricing onDemoRequest={scrollToDemo} />
          <DemoSection />
          <Faq />
          <FinalCta onDemoRequest={scrollToDemo} />
        </main>
        <Footer />
      </div>
    );
  }

  // La couche offline (service worker, bannière hors ligne, file d'envoi) couvre TOUTES les vues.
  return (
    <>
      <OfflineLayer />
      {content}
    </>
  );
}
