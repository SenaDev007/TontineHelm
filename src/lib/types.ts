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

export interface TourStop {
  contributorId: string;
  contributorName: string;
  phone: string | null;
  neighborhood: string;
  passbookId: string;
  passbookNumber: string;
  dailyAmount: number;
  cycleDays: number;
  startsOn: string;
  /** Registre des journées du cycle (multi-jours) : net attribué par journée réelle. */
  days: { date: string; net: number }[];
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
    passbookId: string; number: string; contributor: string; neighborhood: string;
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
}

export interface ContributorRow {
  id: string;
  fullName: string;
  phone: string | null;
  neighborhood: string | null;
  idNumber: string | null;
  agent: string;
  status: string;
  createdAt: string;
  passbook: {
    id: string; number: string; dailyAmount: number; cycleDays: number;
    balance: number; paidDays: number; missedDays: number; status: string;
  } | null;
}

export interface PassbookRow {
  id: string;
  number: string;
  contributor: string;
  phone: string | null;
  neighborhood: string | null;
  agent: string;
  dailyAmount: number;
  cycleDays: number;
  startsOn: string;
  status: string;
  balance: number;
  paidDays: number;
  missedDays: number;
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
    dailyAmount: number;
    cycleDays: number;
    startsOn: string;
    status: string;
    closedAt: string | null;
    createdAt: string;
    balance: number;
    paidDays: number;
    missedDays: number;
    cycleTotal: number;
    elapsedDays: number;
    contributor: {
      id: string;
      fullName: string;
      phone: string | null;
      neighborhood: string | null;
      idNumber: string | null;
    };
    agent: string;
  };
  /** Registre des journées du cycle : net par journée réelle (marquage du calendrier). */
  days: { date: string; net: number }[];
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
  subscription: {
    plan: string; planLabel: string; price: number; status: string;
    trialEndsAt: string | null; periodStart: string | null; periodEnd: string | null;
  } | null;
  usage: {
    agents: number; agentsQuota: number; contributors: number; contributorsQuota: number;
    extraContributors: number; extraAgents: number; smsMonth: number; smsTotal: number;
  };
  invoices: {
    id: string; period: string; baseAmount: number; total: number; status: string;
    paidAt: string | null; createdAt: string; extras: Record<string, number>;
  }[];
}

export interface AdminStructure {
  id: string;
  name: string;
  kind: string;
  licenseRef: string;
  licenseDocName: string | null;
  city: string | null;
  status: string;
  createdAt: string;
  rejectionNote: string | null;
  owner: { fullName: string; phone: string } | null;
  plan: string | null;
  counts: { contributors: number; users: number; collections: number };
}

export interface DemoRequestRow {
  id: string;
  fullName: string;
  phone: string;
  structure: string;
  city: string | null;
  contributors: number | null;
  agents: number | null;
  message: string | null;
  status: "new" | "contacted" | "converted" | "closed";
  createdAt: string;
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
  trial: "Période d'essai",
  active: "Actif",
  past_due: "En retard de paiement",
  read_only: "Lecture seule",
  canceled: "Annulé",
};
