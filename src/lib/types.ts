// TontiHelm — types partagés entre le routeur et les écrans.
import { formatFCFA as fmt } from "@/lib/domain";

export type Role = "owner" | "manager" | "agent" | "controller" | "admin";

export interface SessionUser {
  id: string;
  phone: string;
  fullName: string;
  role: Role;
  tenantId: string | null;
  structureName?: string | null;
  structureKind?: string | null;
  structureStatus?: string | null;
}

export interface SubscriptionInfo {
  plan: string;
  status: "trial" | "active" | "past_due" | "read_only" | "canceled";
  periodEnd: string | null;
}

// ── Livret annuel : 12 feuilles mensuelles + 13e feuille de récapitulatif ──

/** Ligne encaissable du livret (fenêtre envoyée à l'écran d'encaissement). */
export interface PayableLine {
  line: number; // 1..372
  sheet: number; // 1..12
  lineInSheet: number; // 1..31
  company: boolean; // true = 31e ligne : mise de l'entreprise
  label: string;
}

/** Feuille mensuelle du livret : 31 lignes, champs avance/reste. */
export interface LivretSheet {
  index: number;
  key: string;
  year: number;
  month: number;
  label: string;
  shortLabel: string;
  days: number;
  attendu: number;
  encaisse: number;
  avance: number;
  reste: number;
  coveredLines: number;
  partial: number;
  partClient: number;
  partEntreprise: number;
  complete: boolean;
  elapsedLines: number;
  current: boolean;
}

/** 13e feuille — récapitulatif annuel. */
export interface LivretRecap {
  mise: number;
  attendu: number;
  encaisse: number;
  reste: number;
  partEntreprise: number;
  partClient: number;
  sheetsComplete: number;
  sheetsStarted: number;
  missedLines: number;
}

export interface LivretData {
  months: number;
  startsOn: string;
  dailyAmount: number;
  balance: number;
  coveredLines: number;
  lineDue: number;
  missedLines: number;
  currentSheet: number;
  sheets: LivretSheet[];
  recap: LivretRecap;
}

/** Vue « arrêt de tournée » d'un carnet : livret + fenêtre de lignes. */
export interface StopLivret extends LivretData {
  payable: PayableLine[];
  sheet: {
    index: number;
    label: string;
    attendu: number;
    encaisse: number;
    avance: number;
    reste: number;
    coveredLines: number;
  };
  dueLineInSheet: number;
}

export interface TourStop {
  contributorId: string;
  contributorName: string;
  phone: string | null;
  neighborhood: string;
  passbookId: string;
  passbookNumber: string;
  passbookLabel: string | null;
  dailyAmount: number;
  cycleDays: number;
  startsOn: string;
  /** Livret annuel : 12 feuilles mensuelles + récap, avec fenêtre de lignes. */
  livret: StopLivret;
  dayIndex: number;
  paidDays: number;
  missedDays: number;
  balance: number;
  status: string;
  statusLabel: string;
  collectedToday: { count: number; amount: number; method: string; at: string } | null;
}

export interface TourData {
  date: string;
  structure: { name: string; lateThreshold: number };
  agent: { name: string; phone: string };
  neighborhoods: string[];
  stops: TourStop[];
  summary: {
    totalStops: number;
    collected: number;
    remaining: number;
    expectedCash: number;
    mobileToday: number;
  };
  closing: { id: string; status: string; declaredCash: number; expectedCash: number; gap: number } | null;
}

export interface DashboardData {
  today: { total: number; count: number; cash: number; mobile: number };
  week: { total: number; count: number };
  month: { total: number; count: number };
  dailySeries: { day: string; label: string; cash: number; mobile: number }[];
  byAgent: { name: string; amount: number }[];
  byArea: { name: string; amount: number }[];
  latePassbooks: {
    passbookId: string; number: string; label: string | null; contributor: string; neighborhood: string;
    dailyAmount: number; cycleDays: number; balance: number; paidDays: number;
    missedDays: number; agent: string;
  }[];
  unresolvedClosings: {
    id: string; day: string; agent: string; declaredCash: number;
    expectedCash: number; gap: number; status: string;
  }[];
  recent: {
    id: string; at: string; amount: number; method: string;
    contributor: string; passbook: string; agent: string;
  }[];
  contributors: { total: number; activeThisMonth: number };
  /** Montée en charge automatique + alertes dirigeants + lien dédié de l'entité. */
  scaling?: {
    plan: string; planLabel: string; contributors: number; agents: number;
    volumeMonth: number; requiredPlan: string; upgraded: boolean;
  };
  alerts?: { unread: number; events: PlanEventRow[] };
  entity?: { name: string; slug: string; url: string };
}

export interface ContributorRow {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  neighborhood: string | null;
  idNumber: string | null;
  agent: string;
  status: string;
  createdAt: string;
  shareToken: string | null;
  /** Lien personnel du carnet (partagé par WhatsApp / e-mail), rattaché à l'entité. */
  shareUrl: string | null;
  /** Tous les carnets (livrets) du cotisant, regroupés sous son nom. */
  carnets: {
    id: string; number: string; label: string | null; dailyAmount: number;
    balance: number; coveredLines: number; missedLines: number; currentSheet: number; status: string;
  }[];
  activeCarnets: number;
}

/** Client du portefeuille d'un agent (écran Clients de l'application agent). */
export interface AgentClientRow {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  neighborhood: string | null;
  shareToken: string | null;
  shareUrl: string | null;
  status: string;
  /** Tous les carnets (livrets) du client — on clique le client, puis le carnet. */
  carnets: AgentCarnetRow[];
}

/** Carnet (livret annuel) d'un client, vu par son agent. */
export interface AgentCarnetRow {
  id: string;
  number: string;
  label: string | null;
  status: string;
  statusLabel: string;
  dailyAmount: number;
  balance: number;
  livret: StopLivret;
}

/** Carnet public d'un cotisant, consulté depuis son lien personnel. */
export interface PublicCarnetData {
  structure: { name: string; slug: string | null };
  contributor: { fullName: string; neighborhood: string | null };
  passbooks: {
    id: string;
    number: string;
    label: string | null;
    dailyAmount: number;
    startsOn: string;
    status: string;
    statusLabel: string;
    balance: number;
    coveredLines: number;
    missedLines: number;
    livret: LivretData;
    completion: {
      pending: boolean;
      completedAt: string | null;
      payoutAmount: number | null;
      companyAmount: number | null;
      signedAt: string | null;
      signatureName: string | null;
    };
  }[];
  generatedAt: string;
}

export interface PassbookRow {
  id: string;
  number: string;
  label: string | null;
  contributor: string;
  phone: string | null;
  neighborhood: string | null;
  agent: string;
  dailyAmount: number;
  cycleDays: number;
  startsOn: string;
  status: string;
  balance: number;
  coveredLines: number;
  missedLines: number;
  currentSheet: number;
  cycleTotal: number;
}

export interface CarnetCollection {
  id: string;
  amount: number;
  method: string;
  dayIndex: number;
  coversOn: string | null;
  collectedAt: string;
  reversesId: string | null;
}

export interface CarnetData {
  passbook: {
    id: string;
    number: string;
    label: string | null;
    dailyAmount: number;
    cycleDays: number;
    startsOn: string;
    status: string;
    closedAt: string | null;
    createdAt: string;
    balance: number;
    coveredLines: number;
    missedLines: number;
    currentSheet: number;
    cycleTotal: number;
    contributor: {
      id: string;
      fullName: string;
      phone: string | null;
      neighborhood: string | null;
      idNumber: string | null;
    };
    agent: string;
  };
  livret: LivretData;
  completion: {
    status: string;
    completedAt: string | null;
    payoutAmount: number | null;
    companyAmount: number | null;
    signatureName: string | null;
    signedAt: string | null;
  };
  collections: CarnetCollection[];
  structure: { name: string; commissionDays: number; lateThreshold: number };
}

export interface CollectionsPage {
  collections: {
    id: string; at: string; amount: number; method: string; dayIndex: number;
    coversOn: string | null;
    contributor: string; passbook: string; agent: string; reversesId: string | null;
  }[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ClosingRow {
  id: string;
  day: string;
  agent: string;
  declaredCash: number;
  expectedCash: number;
  gap: number;
  status: string;
  validatedAt: string | null;
}

export interface AuditPage {
  chainOk: boolean;
  actions: { action: string; count: number }[];
  logs: {
    seq: number; at: string; actor: string; actorRole: string; action: string;
    entity: string; entityId: string | null; payload: Record<string, unknown>;
    hash: string;
  }[];
  page: number;
  pageSize: number;
  total: number;
}

export interface BillingData {
  structure: { name: string | null; status: string | null };
  entity: { slug: string; url: string };
  subscription: {
    plan: string; planLabel: string; price: number; status: string;
    trialEndsAt: string | null; periodStart: string | null; periodEnd: string | null;
  } | null;
  usage: {
    agents: number; agentsQuota: number; contributors: number; contributorsQuota: number;
    extraContributors: number; extraAgents: number; remindersIncluded: boolean;
    volumeMonth: number;
  };
  alerts: { events: PlanEventRow[]; unread: number };
  invoices: {
    id: string; period: string; baseAmount: number; total: number; status: string;
    paidAt: string | null; createdAt: string; extras: Record<string, number>;
  }[];
}

/** Événement de palier — alerte de montée en charge aux dirigeants. */
export interface PlanEventRow {
  id: string;
  kind: "scaling_warning" | "plan_upgraded" | string;
  fromPlan: string | null;
  toPlan: string;
  message: string;
  contributors: number;
  agents: number;
  volumeMonth: number;
  readAt: string | null;
  createdAt: string;
}

export interface AdminStructure {
  id: string;
  name: string;
  kind: string;
  licenseRef: string | null;
  licenseDocName: string | null;
  city: string | null;
  status: string;
  createdAt: string;
  rejectionNote: string | null;
  owner: { fullName: string; phone: string } | null;
  plan: string | null;
  counts: { contributors: number; users: number; collections: number };
}

export interface OutboxEvent {
  id: string;
  passbookId: string;
  amount: number;
  method: "cash" | "mobile_money";
  advance: boolean;
  /** Journée calendaire couverte ("AAAA-MM-JJ") — multi-jours, null = non précisée. */
  coversOn: string | null;
  collectedAt: string;
  passbookNumber: string;
  contributorName: string;
}

export const formatFCFA = fmt;

export const KIND_LABELS: Record<string, string> = {
  sfd: "SFD (microfinance décentralisée)",
  groupement: "Groupement d'épargne",
  pme: "PME collectrice",
};

export const CLOSING_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  open: { label: "Ouverte", tone: "neutral" },
  declared: { label: "À valider", tone: "warning" },
  validated: { label: "Validée", tone: "success" },
  disputed: { label: "Contestée", tone: "danger" },
};

export const SUB_STATUS: Record<string, string> = {
  trial: "Abonnement à activer",
  active: "Actif",
  past_due: "En retard de paiement",
  read_only: "Lecture seule",
  canceled: "Annulé",
};
