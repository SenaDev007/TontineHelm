"use client";
// TontiHelm — StatusBadge : chaque statut combine une couleur, une icône et un mot (§15.7, §15.11).
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, AlertTriangle, XCircle, Info, Clock, ShieldCheck,
  Banknote, Smartphone, FileCheck2, PauseCircle, X, CircleDollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "gold";

const toneClasses: Record<Tone, string> = {
  success: "bg-[#E7F3EB] text-[#116635] border-[#C4E0CE]",
  warning: "bg-[#FBF0E3] text-[#8F4106] border-[#EDD3B5]",
  danger: "bg-[#FBEAE7] text-[#931D12] border-[#EFC7C0]",
  info: "bg-[#E8F0F9] text-[#16497F] border-[#C5D8ED]",
  neutral: "bg-[#EDF1EA] text-[#3A4A40] border-[#DDE3DC]",
  gold: "bg-[#FAF3E4] text-[#8A6115] border-[#EBD9AE]",
};

function Icon({ tone }: { tone: Tone }) {
  const cls = "h-3.5 w-3.5 tontihelm-icon";
  switch (tone) {
    case "success": return <CheckCircle2 className={cls} aria-hidden />;
    case "warning": return <AlertTriangle className={cls} aria-hidden />;
    case "danger": return <XCircle className={cls} aria-hidden />;
    case "info": return <Info className={cls} aria-hidden />;
    case "gold": return <Clock className={cls} aria-hidden />;
    default: return <PauseCircle className={cls} aria-hidden />;
  }
}

export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium", toneClasses[tone], className)}
    >
      <Icon tone={tone} />
      {label}
    </Badge>
  );
}

// Statuts du carnet (§M2)
export function PassbookStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active": return <StatusBadge label="À jour" tone="success" />;
    case "late": return <StatusBadge label="En retard" tone="danger" />;
    case "closed": return <StatusBadge label="Clos" tone="neutral" />;
    case "withdrawn": return <StatusBadge label="Retiré" tone="warning" />;
    default: return <StatusBadge label={status} />;
  }
}

// Statuts de clôture (§M5)
export function ClosingStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "open": return <StatusBadge label="Ouverte" tone="neutral" />;
    case "declared": return <StatusBadge label="À valider" tone="warning" />;
    case "validated": return <StatusBadge label="Validée" tone="success" />;
    case "disputed": return <StatusBadge label="Contestée" tone="danger" />;
    default: return <StatusBadge label={status} />;
  }
}

// Statuts d'abonnement (§14.13)
export function SubscriptionStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "trial": return <StatusBadge label="Essai 60 jours" tone="info" />;
    case "active": return <StatusBadge label="Abonnement actif" tone="success" />;
    case "past_due": return <StatusBadge label="En retard de paiement" tone="warning" />;
    case "read_only": return <StatusBadge label="Lecture seule" tone="danger" />;
    case "canceled": return <StatusBadge label="Annulé" tone="neutral" />;
    default: return <StatusBadge label={status} />;
  }
}

// Méthode d'encaissement
export function MethodBadge({ method }: { method: string }) {
  return method === "mobile_money" ? (
    <StatusBadge label="Mobile money" tone="info" className="whitespace-nowrap" />
  ) : (
    <StatusBadge label="Espèces" tone="neutral" className="whitespace-nowrap" />
  );
}

// Écart de caisse (§15.7 GapBadge)
export function GapBadge({ gap }: { gap: number }) {
  if (gap === 0) return <StatusBadge label="Écart nul" tone="success" />;
  if (gap > 0) return <StatusBadge label={`Excédent +${gap}`} tone="info" />;
  return <StatusBadge label={`Manquant ${gap}`} tone="danger" />;
}

// Pill de synchronisation (§15.7 SyncStatusPill)
export function SyncStatusPill({
  state,
  pendingCount,
}: {
  state: "synced" | "pending" | "offline" | "error";
  pendingCount: number;
}) {
  switch (state) {
    case "synced":
      return (
        <Badge variant="outline" className="gap-1.5 rounded-full border-[#C4E0CE] bg-[#E7F3EB] px-2.5 py-1 text-xs font-medium text-[#116635]">
          <ShieldCheck className="h-3.5 w-3.5 tontihelm-icon" aria-hidden /> Synchronisé
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="outline" className="gap-1.5 rounded-full border-[#EDD3B5] bg-[#FBF0E3] px-2.5 py-1 text-xs font-medium text-[#8F4106]">
          <Clock className="h-3.5 w-3.5 tontihelm-icon" aria-hidden />
          {pendingCount} en attente
        </Badge>
      );
    case "error":
      return (
        <Badge variant="outline" className="gap-1.5 rounded-full border-[#EFC7C0] bg-[#FBEAE7] px-2.5 py-1 text-xs font-medium text-[#931D12]">
          <XCircle className="h-3.5 w-3.5 tontihelm-icon" aria-hidden /> Erreur d'envoi
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1.5 rounded-full border-[#DDE3DC] bg-[#EDF1EA] px-2.5 py-1 text-xs font-medium text-[#3A4A40]">
          <X className="h-3.5 w-3.5 tontihelm-icon" aria-hidden /> Hors réseau
        </Badge>
      );
  }
}

// Icônes d'activité métier
export function CashIcon() {
  return <Banknote className="h-4 w-4 tontihelm-icon" aria-hidden />;
}
export function MobileMoneyIcon() {
  return <Smartphone className="h-4 w-4 tontihelm-icon" aria-hidden />;
}
export function AuditIcon() {
  return <FileCheck2 className="h-4 w-4 tontihelm-icon" aria-hidden />;
}
export function MoneyIcon() {
  return <CircleDollarSign className="h-4 w-4 tontihelm-icon" aria-hidden />;
}
