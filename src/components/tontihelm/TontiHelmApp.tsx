"use client";
// TontiHelm — MVP de gestion de tontines journalières (YEHI OR Tech, Bénin).
// Routeur principal : site vitrine, inscription, connexion, application agent,
// back-office gérant, back-office administrateur.
import { useCallback, useEffect, useState } from "react";
import { Navbar } from "@/components/tontihelm/landing/Navbar";
import { Hero } from "@/components/tontihelm/landing/Hero";
import { Stats } from "@/components/tontihelm/landing/Stats";
import { Problem, Features, Method, Trust } from "@/components/tontihelm/landing/Sections";
import { Pricing } from "@/components/tontihelm/landing/Pricing";
import { Faq, FinalCta } from "@/components/tontihelm/landing/Faq";
import { DemoSection } from "@/components/tontihelm/landing/DemoSection";
import { Footer } from "@/components/tontihelm/landing/Footer";
import { LoginScreen } from "@/components/tontihelm/auth/LoginScreen";
import { PendingScreen } from "@/components/tontihelm/auth/PendingScreen";
import { RegisterScreen } from "@/components/tontihelm/register/RegisterScreen";
import { AgentApp } from "@/components/tontihelm/agent/AgentApp";
import { ManagerApp } from "@/components/tontihelm/manager/ManagerApp";
import { AdminApp } from "@/components/tontihelm/admin/AdminApp";
import { LogoAnimated } from "@/components/tontihelm/Logo";
import { OfflineLayer } from "@/components/offline/OfflineLayer";
import { clearOfflineData, get, post, setToken } from "@/lib/client";
import { SessionUser, SubscriptionInfo } from "@/lib/types";

type View = "landing" | "login" | "register";

/** Défilement doux vers la section Démonstration (pas de mode gratuit : démo accompagnée). */
function scrollToDemo() {
  document.getElementById("demonstration")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function TontiHelmApp() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [view, setView] = useState<View>("landing");

  // Reprise de session au chargement.
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
    setView("landing");
  }, []);

  const handleLoggedIn = useCallback((u: SessionUser) => {
    setUser(u);
    setView("landing");
    get<{ user: SessionUser | null; subscription: SubscriptionInfo | null }>("/api/auth/me")
      .then((d) => setSubscription(d.subscription))
      .catch(() => undefined);
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
  } else if (view === "login") {
    // ── Visiteur non connecté ──
    content = <LoginScreen onBack={() => setView("landing")} onLoggedIn={handleLoggedIn} />;
  } else if (view === "register") {
    content = <RegisterScreen onBack={() => setView("landing")} onDone={() => setView("landing")} />;
  } else {
    content = (
      <div className="flex min-h-screen flex-col bg-canvas">
        <Navbar onDemoRequest={scrollToDemo} />
        <main className="flex-1">
          <Hero onDemoRequest={scrollToDemo} onStartTrial={() => setView("register")} />
          <Stats />
          <Problem />
          <Features onDemoRequest={scrollToDemo} />
          <Method onStartTrial={() => setView("register")} />
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
