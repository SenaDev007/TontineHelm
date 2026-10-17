// TontiHelm — livret annuel : le moteur des carnets (2026-10).
// Un carnet = un livret annuel d'UNE personne : 12 feuilles mensuelles (une par
// mois, en commençant par le mois en cours à la création) + une 13e feuille de
// récapitulatif. Chaque feuille porte 31 lignes ; la 31e ligne est la mise de
// l'entreprise (marquée, jamais inscrite) : le client verse 31 mises par mois,
// les 30 premières créditent son livret, la 31e revient à la structure.
//
// Les écritures remplissent les lignes SÉQUENTIELLEMENT (ligne 1, 2, 3… puis la
// feuille suivante) — exactement comme l'agent marque le carnet papier : chaque
// encaissement couvre la prochaine ligne non couverte ; payer davantage avance
// le marquage (avance), être en retard laisse la ligne due non couverte
// (rattrapage). Le montant au-delà des mises entières constitue une ligne
// partielle.
import { formatFCFA } from "./domain";

export const LIVRET_MONTHS = 12;
export const SHEET_DAYS = 31;
export const LIVRET_DAYS = LIVRET_MONTHS * SHEET_DAYS; // 372 lignes
export const CLIENT_LINES_PER_SHEET = SHEET_DAYS - 1; // lignes 1..30 créditent le client

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Minuit UTC du premier jour du mois d'une date. */
export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Début du livret : premier jour du mois de départ (le mois en cours à la création). */
export function livretStart(startsOn: Date): Date {
  return monthStart(startsOn);
}

/** Ajoute n mois à un début de mois UTC (reste le 1er du mois). */
export function addMonths(start: Date, n: number): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + n, 1));
}

/** Clé « AAAA-MM » d'un mois. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mois écoulés entre deux débuts de mois UTC. */
export function monthsBetween(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/** Jours d'un mois (28-31) — pour l'étiquette des feuilles. */
export function daysInMonth(year: number, monthIdx: number): number {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}

export interface LivretLike {
  dailyAmount: number;
  startsOn: Date;
}

export interface LivretSheetView {
  index: number; // 1..12
  key: string; // « 2026-10 »
  year: number;
  month: number; // 0..11
  label: string; // « octobre 2026 »
  shortLabel: string; // « oct. 2026 »
  days: number; // jours réels du mois (28-31)
  attendu: number; // mise × 31 — total que la personne versera pour ce mois
  encaisse: number; // versé sur cette feuille
  avance: number; // versé au-delà des jours échus (dynamique)
  reste: number; // attendu − encaissé (dynamique)
  coveredLines: number; // lignes entièrement couvertes (0..31)
  partial: number; // montant sur la ligne en cours (0..mise)
  partClient: number; // ce qui revient au client sur cette feuille (≤ 30 mises)
  partEntreprise: number; // mise de l'entreprise (0 ou mise)
  complete: boolean;
  elapsedLines: number; // lignes « échues » à date (0..31) — pour l'avance
  current: boolean;
}

export interface LivretRecap {
  mise: number;
  attendu: number; // mise × 31 × 12 — total annuel
  encaisse: number; // total réellement versé
  reste: number; // attendu − encaisse
  partEntreprise: number; // 31es mises acquises à la structure
  partClient: number; // ce qui revient au client (encaissé − part entreprise)
  sheetsComplete: number; // feuilles mensuelles entièrement réglées
  sheetsStarted: number; // feuilles avec au moins un versement
  missedLines: number; // lignes échues non couvertes (retard cumulé)
}

export interface LivretView {
  months: number;
  startsOn: string; // AAAA-MM-JJ (1er du mois de départ)
  dailyAmount: number;
  balance: number; // encaissé cumulé (annulations incluses)
  coveredLines: number; // lignes couvertes (1..372)
  lineDue: number; // prochaine ligne à encaisser (1..373)
  missedLines: number;
  currentSheet: number; // 1..12
  sheets: LivretSheetView[];
  recap: LivretRecap;
}

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const MONTHS_FR_SHORT = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/** Libellé du mois en français (« octobre 2026 », « oct. 2026 »). */
export function monthLabel(year: number, monthIdx: number, short = false): string {
  const name = short ? MONTHS_FR_SHORT[monthIdx] : MONTHS_FR[monthIdx];
  return `${name} ${year}`;
}

/**
 * Construit la vue complète du livret annuel : 12 feuilles mensuelles + récap.
 * `balance` = somme des écritures (positif, négatif pour annulations).
 */
export function buildLivret(passbook: LivretLike, balance: number, today: Date = new Date()): LivretView {
  const mise = Math.max(1, passbook.dailyAmount);
  const start = livretStart(passbook.startsOn);
  const todayMonth = monthStart(today);

  const positiveBalance = Math.max(0, balance);
  const coveredLines = Math.min(LIVRET_DAYS, Math.floor(positiveBalance / mise));
  const partial = coveredLines >= LIVRET_DAYS ? 0 : positiveBalance - coveredLines * mise;
  // Feuille portant la ligne partielle (index 0..11) — aucune si partial = 0.
  const partialSheet = partial > 0 ? Math.floor(coveredLines / SHEET_DAYS) : -1;

  // Lignes échues au total : jours écoulés depuis le début du livret, bornés.
  const daysElapsed = Math.floor((utcDay(today) - utcDay(start)) / MS_PER_DAY) + 1;
  const elapsedTotal = Math.min(Math.max(daysElapsed, 0), LIVRET_DAYS);
  const missedLines = Math.max(0, elapsedTotal - coveredLines);

  const sheets: LivretSheetView[] = [];
  for (let i = 0; i < LIVRET_MONTHS; i += 1) {
    const sheetStart = addMonths(start, i);
    const year = sheetStart.getUTCFullYear();
    const month = sheetStart.getUTCMonth();
    const coveredInSheet = Math.min(Math.max(coveredLines - i * SHEET_DAYS, 0), SHEET_DAYS);
    const sheetPartial = partialSheet === i ? partial : 0;
    const encaisse = coveredInSheet * mise + sheetPartial;
    const attendu = mise * SHEET_DAYS;
    // Lignes échues de la feuille : 31 pour les mois passés, jour du mois pour
    // la feuille en cours, 0 pour les feuilles à venir.
    let elapsedLines = SHEET_DAYS;
    const rel = monthsBetween(sheetStart, todayMonth);
    if (rel > 0) elapsedLines = SHEET_DAYS;
    else if (rel === 0) elapsedLines = Math.min(SHEET_DAYS, today.getUTCDate());
    else elapsedLines = 0;
    const avance = Math.max(0, encaisse - mise * elapsedLines);
    const partEntreprise = Math.min(mise, Math.max(0, encaisse - mise * CLIENT_LINES_PER_SHEET));
    sheets.push({
      index: i + 1,
      key: monthKey(sheetStart),
      year,
      month,
      label: monthLabel(year, month),
      shortLabel: monthLabel(year, month, true),
      days: daysInMonth(year, month),
      attendu,
      encaisse,
      avance,
      reste: Math.max(0, attendu - encaisse),
      coveredLines: coveredInSheet,
      partial: sheetPartial,
      partClient: Math.min(encaisse, mise * CLIENT_LINES_PER_SHEET),
      partEntreprise,
      complete: encaisse >= attendu,
      elapsedLines,
      current: rel === 0,
    });
  }

  const partEntrepriseTotal = sheets.reduce((s, sh) => s + sh.partEntreprise, 0);
  const recap: LivretRecap = {
    mise,
    attendu: mise * SHEET_DAYS * LIVRET_MONTHS,
    encaisse: positiveBalance,
    reste: Math.max(0, mise * LIVRET_DAYS - positiveBalance),
    partEntreprise: partEntrepriseTotal,
    partClient: Math.max(0, positiveBalance - partEntrepriseTotal),
    sheetsComplete: sheets.filter((s) => s.complete).length,
    sheetsStarted: sheets.filter((s) => s.encaisse > 0).length,
    missedLines,
  };

  // Feuille courante : celle du mois en cours, sinon la dernière feuille atteinte.
  let currentSheet = monthsBetween(start, todayMonth) + 1;
  if (currentSheet < 1) currentSheet = 1;
  if (currentSheet > LIVRET_MONTHS) currentSheet = LIVRET_MONTHS;

  return {
    months: LIVRET_MONTHS,
    startsOn: start.toISOString().slice(0, 10),
    dailyAmount: mise,
    balance,
    coveredLines,
    lineDue: Math.min(coveredLines + 1, LIVRET_DAYS + 1),
    missedLines,
    currentSheet,
    sheets,
    recap,
  };
}

/** Position (feuille, ligne) d'une ligne absolue 1..372. */
export function linePosition(line: number): { sheet: number; lineInSheet: number; company: boolean } {
  const clamped = Math.min(Math.max(1, line), LIVRET_DAYS);
  const sheet = Math.floor((clamped - 1) / SHEET_DAYS) + 1;
  const lineInSheet = ((clamped - 1) % SHEET_DAYS) + 1;
  return { sheet, lineInSheet, company: lineInSheet === SHEET_DAYS };
}

/** Libellé humain d'une ligne : « L12 · feuille 1 (oct. 2026) » ou mise entreprise. */
export function lineLabel(line: number, start: Date): string {
  const { sheet, lineInSheet, company } = linePosition(line);
  const sheetStart = addMonths(livretStart(start), sheet - 1);
  const label = monthLabel(sheetStart.getUTCFullYear(), sheetStart.getUTCMonth(), true);
  return company ? `Mise entreprise · ${label}` : `Ligne ${lineInSheet} · ${label}`;
}

/** Total attendu d'un livret (FCFA). */
export function livretTotal(dailyAmount: number): number {
  return dailyAmount * LIVRET_DAYS;
}

/** Résumé monétaire d'un livret en une ligne, pour les messages d'alerte. */
export function livretSummary(livret: LivretView): string {
  return `${formatFCFA(livret.recap.encaisse)} versés sur ${formatFCFA(livret.recap.attendu)}`;
}

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ── Sérialisation JSON (réponses API) ─────────────────────────────────────────

export function serializeLivret(livret: LivretView) {
  return {
    months: livret.months,
    startsOn: livret.startsOn,
    dailyAmount: livret.dailyAmount,
    balance: livret.balance,
    coveredLines: livret.coveredLines,
    lineDue: livret.lineDue,
    missedLines: livret.missedLines,
    currentSheet: livret.currentSheet,
    sheets: livret.sheets.map((s) => ({ ...s })),
    recap: { ...livret.recap },
  };
}

export type SerializedLivret = ReturnType<typeof serializeLivret>;
