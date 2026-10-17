"use client";
// TontiHelm — back-office gérant (M6, §15.8) : sidebar étendue au bureau, réduite en icônes
// sur tablette, menu tiroir sur mobile. Contrôleur : lecture seule (pas d'actions d'écriture).
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogoWordmark, LogoMark } from "../Logo";
import { SessionUser, SubscriptionInfo } from "@/lib/types";
import { DashboardTab } from "./DashboardTab";
import { ContributorsTab } from "./ContributorsTab";
import { PassbooksTab } from "./PassbooksTab";
import { CollectionsTab } from "./CollectionsTab";
import { ClosingsTab } from "./ClosingsTab";
import { AuditTab } from "./AuditTab";
import { BillingTab } from "./BillingTab";
import { TeamTab } from "./TeamTab";
import { ArchiveTab } from "./ArchiveTab";
import { AlertsBell } from "./AlertsBell";
import {
  LayoutDashboard, Users, BookOpen, Receipt, Scale, FileClock,
  CreditCard, Menu, LogOut, ShieldCheck, UserCog, Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "dashboard" | "team" | "contributors" | "passbooks" | "collections" | "closings" | "archive" | "audit" | "billing";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "team", label: "Équipe", icon: UserCog },
  { id: "contributors", label: "Cotisants", icon: Users },
  { id: "passbooks", label: "Carnets", icon: BookOpen },
  { id: "collections", label: "Encaissements", icon: Receipt },
  { id: "closings", label: "Clôtures", icon: Scale },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "audit", label: "Journal d'audit", icon: FileClock },
  { id: "billing", label: "Abonnement", icon: CreditCard },
];

function ManagerNav({
  tab,
  onTab,
  onNavigate,
  tabs,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  onNavigate?: () => void;
  tabs: { id: Tab; label: string; icon: React.ElementType }[];
}) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Navigation du back-office">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => { onTab(t.id); onNavigate?.(); }}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            tab === t.id ? "bg-primary text-primary-foreground" : "text-subtle hover:bg-[#EDF2F7] hover:text-ink"
          )}
          aria-current={tab === t.id ? "page" : undefined}
          title={t.label}
        >
          <t.icon className="h-5 w-5 shrink-0 tontihelm-icon" aria-hidden />
          <span className="hidden lg:inline">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function ManagerApp({
  user,
  subscription,
  onLogout,
}: {
  user: SessionUser;
  subscription: SubscriptionInfo | null;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const readOnly = user.role === "controller" || subscription?.status === "read_only";

  // Espaces distincts : le dirigeant (administrateur principal) pilote TOUT —
  // équipe complète (gérants + agents), abonnement, facturation ; le gérant
  // gère l'opérationnel (cotisants, carnets, encaissements, clôtures, audit)
  // et l'équipe de collecte. L'onglet Abonnement est réservé au dirigeant.
  const isOwner = user.role === "owner";
  const visibleTabs = TABS.filter((t) => (t.id === "billing" ? isOwner : true));
  const spaceLabel = isOwner ? "Espace dirigeant" : user.role === "manager" ? "Espace gérant" : user.role === "controller" ? "Espace contrôleur" : "Back-office";

  const readOnlyBanner =
    subscription?.status === "read_only"
      ? "Compte en lecture seule. Règle ton abonnement pour reprendre les encaissements."
      : user.role === "controller"
        ? "Mode contrôleur : consultation et export uniquement."
        : null;

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar bureau / tablette */}
      <aside className="sticky top-0 hidden h-screen w-[72px] flex-col border-r border-line bg-white px-2 py-4 md:flex lg:w-64 lg:px-3">
        <div className="mb-6 flex items-center justify-center lg:justify-start lg:px-2">
          <span className="hidden lg:inline"><LogoWordmark size={30} /></span>
          <span className="lg:hidden"><LogoMark size={30} /></span>
        </div>
        <ManagerNav tab={tab} onTab={setTab} tabs={visibleTabs} />
        <div className="mt-auto space-y-2">
          {readOnly && (
            <Badge variant="outline" className="hidden w-full justify-center gap-1.5 rounded-md border-[#F5C6C0] bg-[#FDECEA] px-2 py-1 text-[11px] font-medium text-[#B3261E] lg:flex">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Lecture seule
            </Badge>
          )}
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-subtle transition-colors hover:bg-[#FDECEA] hover:text-danger"
          >
            <LogOut className="h-5 w-5 shrink-0 tontihelm-icon" aria-hidden />
            <span className="hidden lg:inline">Se déconnecter</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre du haut mobile */}
        <header className="sticky top-0 z-30 border-b border-line bg-white md:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="border-line" aria-label="Ouvrir le menu">
                  <Menu className="h-5 w-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-white p-0">
                <div className="border-b border-line p-4">
                  <SheetTitle className="text-left"><LogoWordmark size={30} /></SheetTitle>
                </div>
                <div className="p-3"><ManagerNav tab={tab} onTab={setTab} tabs={visibleTabs} onNavigate={() => setMenuOpen(false)} /></div>
                <div className="mt-auto border-t border-line p-3">
                  <Button variant="outline" onClick={onLogout} className="w-full border-line text-danger hover:bg-[#FDECEA] hover:text-danger">
                    <LogOut className="h-4 w-4" aria-hidden /> Se déconnecter
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{visibleTabs.find((t) => t.id === tab)?.label}</p>
              <p className="truncate text-xs text-subtle">{spaceLabel} · {user.structureName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <AlertsBell />
              <LogoMark size={30} />
            </div>
          </div>
        </header>

        {/* Bandeau lecture seule (§13.4) */}
        {readOnlyBanner && (
          <div className="border-b border-[#F5C6C0] bg-[#FDECEA] px-4 py-2.5 md:px-6 lg:px-8" role="alert">
            <p className="mx-auto max-w-6xl text-sm font-medium text-[#B3261E]">{readOnlyBanner}</p>
          </div>
        )}

        {/* En-tête bureau */}
        <div className="hidden border-b border-line bg-white md:block">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 lg:px-8">
            <div>
              <h1 className="font-display text-lg font-bold text-ink">{visibleTabs.find((t) => t.id === tab)?.label}</h1>
              <p className="text-sm text-subtle">
                {spaceLabel} · {user.structureName} · <span className="font-medium text-ink">{user.fullName}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              {subscription && (
                <Badge variant="outline" className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium",
                  subscription.status === "active" ? "border-[#B5E8E5] bg-[#DFF6F4] text-[#00806B]" : "border-[#F5C6C0] bg-[#FDECEA] text-[#B3261E]"
                )}>
                  {subscription.plan === "pro" ? "Palier Pro" : subscription.plan === "demarrage" ? "Palier Démarrage" : subscription.plan === "institution" ? "Palier Institution" : subscription.plan}
                </Badge>
              )}
              <AlertsBell />
            </div>
          </div>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 lg:px-8">
          {tab === "dashboard" && <DashboardTab />}
          {tab === "team" && <TeamTab readOnly={readOnly} isOwner={isOwner} />}
          {tab === "contributors" && <ContributorsTab readOnly={readOnly} structureName={user.structureName ?? "Structure"} />}
          {tab === "passbooks" && <PassbooksTab readOnly={readOnly} />}
          {tab === "collections" && <CollectionsTab readOnly={readOnly} structureName={user.structureName ?? "Structure"} />}
          {tab === "closings" && <ClosingsTab readOnly={readOnly} />}
          {tab === "archive" && <ArchiveTab />}
          {tab === "audit" && <AuditTab structureName={user.structureName ?? "Structure"} />}
          {tab === "billing" && isOwner && <BillingTab user={user} />}
        </main>
      </div>
    </div>
  );
}
