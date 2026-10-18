// TontiHelm — données des rapports exportables (PDF / Excel, 2026-10).
// Construit les jeux de données complets servis aux générateurs :
//   · Cotisants  : tous les cotisants avec leurs carnets (livrets), regroupés
//     automatiquement par quartier — un cotisant multi-carnets porte la liste
//     de ses carnets sous son identité ;
//   · Encaissements : l'historique des paiements sur une période (du … au …),
//     avec totaux espèces / mobile money / net.
import { db } from "./db";
import { passbookBalance } from "./domain";
import { buildLivret } from "./livret";

export interface ReportStructure {
  name: string;
  city: string | null;
  slug: string | null;
}

export interface CarnetReportRow {
  id: string;
  number: string;
  label: string | null;
  dailyAmount: number;
  coveredLines: number; // mises versées (lignes du livret couvertes)
  balance: number;
  status: string;
  statusLabel: string;
  createdAt: Date;
}

export interface ContributorReportEntry {
  id: string;
  fullName: string;
  phone: string | null;
  createdAt: Date; // date de création du COMPTE cotisant
  carnets: CarnetReportRow[];
}

export interface QuartierGroup {
  neighborhood: string;
  entries: ContributorReportEntry[];
  cotisants: number;
  carnets: number;
  mises: number; // somme des mises versées
  solde: number; // somme des soldes cumulés
}

export interface ContributorsReport {
  structure: ReportStructure;
  generatedAt: Date;
  groups: QuartierGroup[];
  totals: { cotisants: number; carnets: number; quartiers: number; mises: number; solde: number };
}

function carnetStatusLabel(pb: { status: string }, missedLines: number): string {
  if (pb.status === "completed") return "Terminé et signé";
  if (pb.status === "closing") return "Remise en cours";
  if (pb.status === "closed") return "Clos";
  if (pb.status === "withdrawn") return "Retiré";
  if (missedLines >= 3) return "En retard";
  return "À jour";
}

/** Liste complète des cotisants, groupée par quartier (tri alphabétique). */
export async function buildContributorsReport(tenantId: string): Promise<ContributorsReport> {
  const [structure, contributors] = await Promise.all([
    db.structure.findUnique({
      where: { id: tenantId },
      select: { name: true, city: true, slug: true },
    }),
    db.contributor.findMany({
      where: { tenantId },
      include: {
        passbooks: { orderBy: { createdAt: "asc" }, include: { collections: true } },
      },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const byQuartier = new Map<string, ContributorReportEntry[]>();
  for (const c of contributors) {
    const carnets: CarnetReportRow[] = c.passbooks.map((pb) => {
      const balance = passbookBalance(pb.collections);
      const livret = buildLivret(pb, balance);
      return {
        id: pb.id,
        number: pb.number,
        label: pb.label,
        dailyAmount: pb.dailyAmount,
        coveredLines: livret.coveredLines,
        balance,
        status: pb.status,
        statusLabel: carnetStatusLabel(pb, livret.missedLines),
        createdAt: pb.createdAt,
      };
    });
    const entry: ContributorReportEntry = {
      id: c.id,
      fullName: c.fullName,
      phone: c.phone,
      createdAt: c.createdAt,
      carnets,
    };
    const key = c.neighborhood?.trim() || "Sans quartier";
    const list = byQuartier.get(key) ?? [];
    list.push(entry);
    byQuartier.set(key, list);
  }

  const groups: QuartierGroup[] = [...byQuartier.entries()]
    .map(([neighborhood, entries]) => ({
      neighborhood,
      entries,
      cotisants: entries.length,
      carnets: entries.reduce((s, e) => s + e.carnets.length, 0),
      mises: entries.reduce((s, e) => s + e.carnets.reduce((x, k) => x + k.coveredLines, 0), 0),
      solde: entries.reduce((s, e) => s + e.carnets.reduce((x, k) => x + k.balance, 0), 0),
    }))
    .sort((a, b) => a.neighborhood.localeCompare(b.neighborhood, "fr"));

  return {
    structure: {
      name: structure?.name ?? "Structure",
      city: structure?.city ?? null,
      slug: structure?.slug ?? null,
    },
    generatedAt: new Date(),
    groups,
    totals: {
      cotisants: groups.reduce((s, g) => s + g.cotisants, 0),
      carnets: groups.reduce((s, g) => s + g.carnets, 0),
      quartiers: groups.length,
      mises: groups.reduce((s, g) => s + g.mises, 0),
      solde: groups.reduce((s, g) => s + g.solde, 0),
    },
  };
}

// ── Encaissements sur une période ─────────────────────────────────────────────

export interface CollectionReportRow {
  at: Date;
  contributor: string;
  passbook: string;
  carnetLabel: string | null;
  agent: string;
  neighborhood: string;
  line: number;
  method: "cash" | "mobile_money";
  amount: number;
  reversal: boolean;
}

export interface CollectionsReport {
  structure: ReportStructure;
  period: { from: Date; to: Date; label: string };
  generatedAt: Date;
  methodLabel: string;
  rows: CollectionReportRow[];
  totals: {
    versements: number;
    annulations: number;
    cash: number; // net espèces (annulations incluses)
    mobile: number; // net mobile money
    net: number;
  };
}

/** Parse « AAAA-MM-JJ » en début de journée UTC ; renvoie null si invalide. */
export function parseDayParam(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Historique des paiements sur une période (bornes incluses), méthode filtrable. */
export async function buildCollectionsReport(
  tenantId: string,
  from: Date,
  to: Date,
  method?: "cash" | "mobile_money" | undefined
): Promise<CollectionsReport> {
  // `to` inclusif → borne exclusive au jour suivant.
  const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);

  const [structure, collections] = await Promise.all([
    db.structure.findUnique({
      where: { id: tenantId },
      select: { name: true, city: true, slug: true },
    }),
    db.collection.findMany({
      where: {
        tenantId,
        collectedAt: { gte: from, lt: toExclusive },
        ...(method ? { method } : {}),
      },
      include: {
        passbook: { include: { contributor: true } },
        agent: { select: { fullName: true } },
      },
      orderBy: { collectedAt: "asc" },
    }),
  ]);

  const rows: CollectionReportRow[] = collections.map((c) => ({
    at: c.collectedAt,
    contributor: c.passbook?.contributor?.fullName ?? "—",
    passbook: c.passbook?.number ?? "",
    carnetLabel: c.passbook?.label ?? null,
    agent: c.agent?.fullName ?? "—",
    neighborhood: c.passbook?.contributor?.neighborhood ?? "—",
    line: c.dayIndex,
    method: c.method as "cash" | "mobile_money",
    amount: c.amount,
    reversal: Boolean(c.reversesId),
  }));

  const totals = rows.reduce(
    (acc, r) => ({
      versements: acc.versements + (r.amount > 0 ? 1 : 0),
      annulations: acc.annulations + (r.amount < 0 ? 1 : 0),
      cash: acc.cash + (r.method === "cash" ? r.amount : 0),
      mobile: acc.mobile + (r.method === "mobile_money" ? r.amount : 0),
      net: acc.net + r.amount,
    }),
    { versements: 0, annulations: 0, cash: 0, mobile: 0, net: 0 }
  );

  const fmtDay = (d: Date) =>
    d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return {
    structure: {
      name: structure?.name ?? "Structure",
      city: structure?.city ?? null,
      slug: structure?.slug ?? null,
    },
    period: { from, to, label: `du ${fmtDay(from)} au ${fmtDay(to)}` },
    generatedAt: new Date(),
    methodLabel: method === "cash" ? "Espèces" : method === "mobile_money" ? "Mobile money" : "Toutes méthodes",
    rows,
    totals,
  };
}

/* ── Formatage partagé PDF / Excel ─────────────────────────────────────────── */

/** « 1 500 » avec séparateurs français (espace insécable). */
export function formatNumberFr(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}

/** « 1 500 FCFA ». */
export function formatFcfa(n: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.abs(n))} FCFA`;
}

/** « 17/10/2026 ». */
export function formatDayShort(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** « 14:32 ». */
export function formatTime(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

/** « 17 octobre 2026 à 14:32 ». */
export function formatDateTimeLong(d: Date): string {
  return `${d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })} à ${formatTime(d)}`;
}

// ── Journal d'audit (décision n° 10, PARITE.md §8.15) ─────────────────────────
// Export du journal complet d'une structure : chaque ligne horodatée, son auteur,
// son action, le détail (payload JSON) et l'empreinte de chaînage — l'ordre des
// numéros de séquence EST l'ordre de scellement de la chaîne.

import { verifyAuditChain } from "./audit";

export interface AuditReportRow {
  seq: number;
  at: Date;
  actor: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string | null;
  payload: string; // JSON compact (une ligne)
  hash: string;
}

export interface AuditReport {
  structure: ReportStructure;
  generatedAt: Date;
  actionFilter: string | null;
  period: { from: Date | null; to: Date | null; label: string };
  chainOk: boolean;
  rows: AuditReportRow[];
  totals: { rows: number; actions: number };
}

/** Journal d'audit exportable : filtre d'action et période (bornes inclusives). */
export async function buildAuditReport(
  tenantId: string,
  opts: { action?: string | undefined; from?: Date | undefined; to?: Date | undefined } = {}
): Promise<AuditReport> {
  const toExclusive = opts.to ? new Date(opts.to.getTime() + 24 * 60 * 60 * 1000) : undefined;

  const [structure, logs, chainOk] = await Promise.all([
    db.structure.findUnique({
      where: { id: tenantId },
      select: { name: true, city: true, slug: true },
    }),
    db.auditLog.findMany({
      where: {
        tenantId,
        ...(opts.action ? { action: opts.action } : {}),
        ...(opts.from || toExclusive
          ? { at: { ...(opts.from ? { gte: opts.from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } }
          : {}),
      },
      include: { actor: { select: { fullName: true, role: true } } },
      orderBy: { seq: "asc" },
    }),
    verifyAuditChain(tenantId),
  ]);

  const rows: AuditReportRow[] = logs.map((l) => ({
    seq: Number(l.seq),
    at: l.at,
    actor: l.actor?.fullName ?? "Système",
    actorRole: l.actor?.role ?? "system",
    action: l.action,
    entity: l.entity,
    entityId: l.entityId,
    payload: JSON.stringify(JSON.parse(l.payload)),
    hash: l.hash,
  }));

  const fmtDay = (d: Date) =>
    d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const periodLabel = opts.from || opts.to
    ? `du ${opts.from ? fmtDay(opts.from) : "l'origine"} au ${opts.to ? fmtDay(opts.to) : "aujourd'hui"}`
    : "depuis l'origine";

  return {
    structure: {
      name: structure?.name ?? "Structure",
      city: structure?.city ?? null,
      slug: structure?.slug ?? null,
    },
    generatedAt: new Date(),
    actionFilter: opts.action ?? null,
    period: { from: opts.from ?? null, to: opts.to ?? null, label: periodLabel },
    chainOk,
    rows,
    totals: {
      rows: rows.length,
      actions: new Set(rows.map((r) => r.action)).size,
    },
  };
}
