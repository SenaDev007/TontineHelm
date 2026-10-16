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
import { Faq, FinalCta, Footer } from "@/components/tontihelm/landing/Faq";
import { LoginScreen } from "@/components/tontihelm/auth/LoginScreen";
import { PendingScreen } from "@/components/tontihelm/auth/PendingScreen";
import { RegisterScreen } from "@/components/tontihelm/register/RegisterScreen";
import { AgentApp } from "@/components/tontihelm/agent/AgentApp";
import { ManagerApp } from "@/components/tontihelm/manager/ManagerApp";
import { AdminApp } from "@/components/tontihelm/admin/AdminApp";
import { get, post, setToken } from "@/lib/client";
import { SessionUser, SubscriptionInfo } from "@/lib/types";

type View = "landing" | "login" | "register";

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

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-live="polite">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
          <p className="mt-3 text-sm text-subtle">Chargement de TontiHelm…</p>
        </div>
      </div>
    );
  }

  // ── Utilisateur connecté ──
  if (user) {
    // Structure en attente de validation ou suspendue : écran d'attente.
    if (user.tenantId && user.structureStatus !== "active") {
      return <PendingScreen user={user} onLogout={handleLogout} />;
    }
    if (user.role === "admin") {
      return <AdminApp onLogout={handleLogout} />;
    }
    if (user.role === "agent") {
      return <AgentApp user={user} onLogout={handleLogout} />;
    }
    return <ManagerApp user={user} subscription={subscription} onLogout={handleLogout} />;
  }

  // ── Visiteur non connecté ──
  if (view === "login") {
    return <LoginScreen onBack={() => setView("landing")} onLoggedIn={handleLoggedIn} />;
  }
  if (view === "register") {
    return <RegisterScreen onBack={() => setView("landing")} onDone={() => setView("landing")} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Navbar onStartTrial={() => setView("register")} />
      <main className="flex-1">
        <Hero onStartTrial={() => setView("register")} />
        <Stats />
        <Problem />
        <Features onDemo={() => setView("login")} />
        <Method onStartTrial={() => setView("register")} />
        <Trust />
        <Pricing onStartTrial={() => setView("register")} />
        <Faq />
        <FinalCta onStartTrial={() => setView("register")} />
      </main>
      <Footer />
    </div>
  );
}
