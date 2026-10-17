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
//
// ⚠ Règle d'équité (2026-10-17) : personne n'est en retard pour des jours
// ANTERIEURS à son arrivée. Le livret démarre au mois de création, mais si le
// cotisant arrive en cours de mois (créé le 17 alors que le mois a commencé le
// 1er), les lignes qui précèdent son jour d'arrivée sont EXCUSEES : non dues,
// hors attendu, hors comptage du retard. La 1re ligne encaissable est celle de
// son jour d'arrivée.
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
  /** Date de création du carnet : borne le début réel (jamais en retard avant son arrivée). */
  createdAt?: Date | null;
}

export interface AdvanceOption {
  sheet: number; // 1..12 — l'avance couvre jusqu'à la FIN de cette feuille
  label: string; // « nov. 2026 »
  amount: number; // montant à encaisser pour couvrir jusqu'à cette feuille
  resteAfter: number; // ce qu'il restera à prendre après cette avance
}

export interface LivretSheetView {
  index: number; // 1..12
  key: string; // « 2026-10 »
  year: number;
  month: number; // 0..11
  label: string; // « octobre 2026 »
  shortLabel: string; // « oct. 2026 »
  days: number; // jours réels du mois (28-31)
  attendu: number; // mise × lignes encaissables de la feuille (proratisé au mois d'arrivée)
  encaisse: number; // versé sur cette feuille
  avance: number; // versé au-delà des jours échus (dynamique)
  reste: number; // attendu − encaissé (dynamique)
  coveredLines: number; // lignes entièrement couvertes (0..31)
  partial: number; // montant sur la ligne en cours (0..mise)
  partClient: number; // ce qui revient au client sur cette feuille
  partEntreprise: number; // mise de l'entreprise (0 ou mise)
  complete: boolean;
  elapsedLines: number; // lignes « échues » à date (0..31) — pour l'avance
  current: boolean;
  excused: number; // lignes AVANT l'arrivée du cotisant (non dues) — feuille du mois d'arrivée
  payable: number; // lignes encaissables de la feuille = 31 − excused
}

export interface LivretRecap {
  mise: number;
  attendu: number; // mise × lignes encaissables (proratisé au mois d'arrivée)
  encaisse: number; // total réellement versé
  reste: number; // attendu − encaisse — « il lui reste à prendre »
  avanceTotale: number; // versé au-delà des échéances, toutes feuilles confondues
  partEntreprise: number; // 31es mises acquises à la structure
  partClient: number; // ce qui revient au client (encaissé − part entreprise)
  sheetsComplete: number; // feuilles mensuelles entièrement réglées
  sheetsStarted: number; // feuilles avec au moins un versement
  missedLines: number; // lignes échues non couvertes (retard cumulé, DEPUIS l'arrivée)
}

export interface LivretView {
  months: number;
  startsOn: string; // AAAA-MM-JJ (1er du mois de départ)
  effectiveStart: string; // AAAA-MM-JJ — jour d'arrivée réel du cotisant
  dailyAmount: number;
  balance: number; // encaissé cumulé (annulations incluses)
  coveredLines: number; // lignes encaissables couvertes (décompte, pas la ligne absolue)
  payableLines: number; // lignes encaissables du livret (372 − excusées)
  excusedLines: number; // lignes avant l'arrivée (non dues)
  lineDue: number; // prochaine ligne à encaisser, ABSOLUE (1..373)
  missedLines: number;
  currentSheet: number; // 1..12
  coveredThrough: { sheet: number; label: string } | null; // feuille la plus avancée couverte
  advanceOptions: AdvanceOption[]; // avances mensuelles calculées automatiquement
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
 * Jour d'arrivée réel du cotisant : le livret démarre au 1er du mois de
 * création, mais le cotisant n'est pas redevable des jours antérieurs à la
 * création de son carnet. On prend donc le MAX du 1er du mois de départ et du
 * jour de création (au jour près).
 */
export function effectiveStartDay(passbook: LivretLike): Date {
  const month = monthStart(passbook.startsOn);
  if (!passbook.createdAt) return month;
  const created = utcDay(passbook.createdAt);
  const first = utcDay(month);
  return created > first ? new Date(created) : month;
}

/**
 * Première ligne encaissable du livret (ABSOLUE, 1..372) : celle du jour
 * d'arrivée. Les lignes 1..firstLine−1 sont excusées (avant l'arrivée).
 */
export function firstPayableLine(passbook: LivretLike): number {
  const start = livretStart(passbook.startsOn);
  const eff = effectiveStartDay(passbook);
  const effMonth = Math.min(Math.max(monthsBetween(start, monthStart(eff)), 0), LIVRET_MONTHS);
  const day = Math.min(Math.max(eff.getUTCDate(), 1), SHEET_DAYS);
  return Math.min(effMonth * SHEET_DAYS + day, LIVRET_DAYS);
}

/**
 * Construit la vue complète du livret annuel : 12 feuilles mensuelles + récap.
 * `balance` = somme des écritures (positif, négatif pour annulations).
 */
export function buildLivret(passbook: LivretLike, balance: number, today: Date = new Date()): LivretView {
  const mise = Math.max(1, passbook.dailyAmount);
  const start = livretStart(passbook.startsOn);
  const todayMonth = monthStart(today);

  // ── Arrivée du cotisant et lignes excusées (jamais en retard avant son arrivée) ──
  const firstLine = firstPayableLine(passbook);
  const excusedTotal = firstLine - 1;
  const effMonthIdx = Math.floor((firstLine - 1) / SHEET_DAYS); // feuille (0-based) de l'arrivée
  const effDayInSheet = ((firstLine - 1) % SHEET_DAYS) + 1; // 1..31 dans sa feuille
  const payableTotal = LIVRET_DAYS - excusedTotal;

  const positiveBalance = Math.max(0, balance);
  const coveredLines = Math.min(payableTotal, Math.floor(positiveBalance / mise));
  const partial = coveredLines >= payableTotal ? 0 : positiveBalance - coveredLines * mise;
  const lastCoveredAbs = coveredLines > 0 ? firstLine + coveredLines - 1 : 0; // ligne absolue de la dernière mise
  // Feuille portant la ligne partielle (index 0..11) — aucune si partial = 0.
  const partialLineAbs = partial > 0 ? firstLine + coveredLines : 0;

  const sheets: LivretSheetView[] = [];
  let elapsedTotal = 0;
  for (let i = 0; i < LIVRET_MONTHS; i += 1) {
    const sheetStart = addMonths(start, i);
    const year = sheetStart.getUTCFullYear();
    const month = sheetStart.getUTCMonth();
    const sheetFirstAbs = i * SHEET_DAYS + 1;
    const sheetLastAbs = (i + 1) * SHEET_DAYS;

    // Lignes excusées de la feuille : toute la feuille avant le mois d'arrivée,
    // ou les lignes d'avant le jour d'arrivée dans la feuille d'arrivée.
    const excused = i < effMonthIdx ? SHEET_DAYS : i === effMonthIdx ? effDayInSheet - 1 : 0;
    const payableCount = SHEET_DAYS - excused;

    // Lignes couvertes de la feuille : intersection de la plage couverte
    // [firstLine, lastCoveredAbs] avec les lignes absolues de la feuille.
    const coveredInSheet =
      coveredLines > 0
        ? Math.max(0, Math.min(sheetLastAbs, lastCoveredAbs) - Math.max(sheetFirstAbs, firstLine) + 1)
        : 0;
    const sheetPartial = partialLineAbs >= sheetFirstAbs && partialLineAbs <= sheetLastAbs ? partial : 0;
    const encaisse = coveredInSheet * mise + sheetPartial;
    const attendu = mise * payableCount;

    // Lignes échues de la feuille : par calendrier, MAIS en comptant depuis le
    // jour d'arrivée sur la feuille d'arrivée (jamais en retard avant l'arrivée).
    const rel = monthsBetween(sheetStart, todayMonth);
    const elapsedLines =
      rel > 0
        ? payableCount
        : rel === 0
          ? Math.min(payableCount, Math.max(0, today.getUTCDate() - excused))
          : 0;
    elapsedTotal += elapsedLines;

    const avance = Math.max(0, encaisse - mise * elapsedLines);
    const clientLines = Math.max(0, payableCount - 1); // la 31e ligne = entreprise
    const partEntreprise = Math.min(mise, Math.max(0, encaisse - mise * clientLines));
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
      partClient: Math.min(encaisse, mise * clientLines),
      partEntreprise,
      complete: payableCount > 0 && encaisse >= attendu,
      elapsedLines,
      current: rel === 0,
      excused,
      payable: payableCount,
    });
  }

  const missedLines = Math.max(0, elapsedTotal - coveredLines);
  const partEntrepriseTotal = sheets.reduce((s, sh) => s + sh.partEntreprise, 0);
  const attenduTotal = mise * payableTotal;
  const avanceTotale = sheets.reduce((s, sh) => s + sh.avance, 0);
  const recap: LivretRecap = {
    mise,
    attendu: attenduTotal,
    encaisse: positiveBalance,
    reste: Math.max(0, attenduTotal - positiveBalance),
    avanceTotale,
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

  // Feuille la plus avancée couverte par les versements (affichage « couvre jusqu'à »).
  let coveredThrough: { sheet: number; label: string } | null = null;
  if (coveredLines > 0) {
    const throughSheet = Math.min(Math.ceil(lastCoveredAbs / SHEET_DAYS), LIVRET_MONTHS);
    coveredThrough = { sheet: throughSheet, label: sheets[throughSheet - 1].label };
  }

  // ── Avances mensuelles calculées automatiquement ──
  // Le cotisant veut payer d'avance : on renseigne JUSQU'OÙ l'avance couvre (la
  // fin du mois en cours seul, ou plusieurs mois au-delà) et le système calcule
  // le montant (rattrapage inclus) puis ce qu'il restera à prendre.
  const advanceOptions: AdvanceOption[] = [];
  for (let m = effMonthIdx + 1; m <= LIVRET_MONTHS; m += 1) {
    const targetAbs = m * SHEET_DAYS; // dernière ligne (absolue) de la feuille m
    const amount = mise * (targetAbs - firstLine + 1) - positiveBalance;
    if (amount > 0) {
      advanceOptions.push({
        sheet: m,
        label: sheets[m - 1].shortLabel,
        amount,
        resteAfter: Math.max(0, attenduTotal - positiveBalance - amount),
      });
    }
  }

  return {
    months: LIVRET_MONTHS,
    startsOn: start.toISOString().slice(0, 10),
    effectiveStart: new Date(Date.UTC(
      addMonths(start, effMonthIdx).getUTCFullYear(),
      addMonths(start, effMonthIdx).getUTCMonth(),
      effDayInSheet
    )).toISOString().slice(0, 10),
    dailyAmount: mise,
    balance,
    coveredLines,
    payableLines: payableTotal,
    excusedLines: excusedTotal,
    lineDue: Math.min(firstLine + coveredLines, LIVRET_DAYS + 1),
    missedLines,
    currentSheet,
    coveredThrough,
    advanceOptions,
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

/** Total attendu d'un livret (FCFA) — toutes lignes, hors excuses. */
export function livretTotal(dailyAmount: number): number {
  return dailyAmount * LIVRET_DAYS;
}

// ── Avance PARTIELLE (décision du dirigeant, 2026-10-18) ──────────────────────
// L'avance n'est PAS obligatoirement le montant total du mois couvert : le
// cotisant peut verser juste une PARTIE. L'agent renseigne le montant que le
// cotisant désire payer — le système calcule jusqu'où cette avance couvre
// (rattrapage inclus), ce qu'elle laisse sur la ligne en cours, et ce qu'il
// restera à prendre. Fonction PURE consommée par le web ET le mobile, sur la
// vue sérialisée du livret (mêmes champs que les réponses /api et /v1).

/** Entrée de l'aperçu d'avance : champs du livret sérialisé (vue d'arrêt / pull). */
export interface AdvancePreviewInput {
  dailyAmount: number;
  balance: number; // solde cumulé (annulations incluses, peut être négatif)
  coveredLines: number; // lignes encaissables couvertes (décompte)
  payableLines: number; // lignes encaissables du livret (372 − excusées)
  lineDue: number; // prochaine ligne à encaisser, ABSOLUE (1..373)
  attendu: number; // total attendu du livret (recap.attendu)
  sheets: { shortLabel: string }[]; // 12 libellés courts « oct. 2026 »
}

/** Aperçu d'une avance (totale ou partielle) avant encaissement. */
export interface AdvancePreviewResult {
  amount: number; // montant retenu (entier, plancher)
  valid: boolean; // montant > 0
  exceedsReste: boolean; // montant > reste à encaisser du livret
  resteBefore: number; // reste à encaisser AVANT l'écriture
  linesCoveredAfter: number; // lignes entièrement couvertes après l'écriture
  coversThroughLine: number; // dernière ligne ABSOLUE couverte (0 si aucune)
  coversThroughSheet: number | null; // feuille (1..12) de cette ligne
  coversThroughLabel: string | null; // « nov. 2026 »
  coversFullSheet: boolean; // l'avance atteint la FIN de la feuille couverte
  partialAfter: number; // montant posé sur la ligne entamée (0..mise−1)
  resteAfter: number; // ce qu'il restera à prendre après cette avance
}

export function advancePreview(v: AdvancePreviewInput, amount: number): AdvancePreviewResult {
  const mise = Math.max(1, v.dailyAmount);
  const positiveBalance = Math.max(0, v.balance);
  const firstLine = Math.max(1, Math.min(v.lineDue - v.coveredLines, LIVRET_DAYS));
  const resteBefore = Math.max(0, v.attendu - positiveBalance);
  const raw = Number.isFinite(amount) ? Math.floor(amount) : 0;
  const safe = Math.max(0, raw);
  const exceedsReste = safe > resteBefore;
  const coveredAfter = Math.min(v.payableLines, Math.floor((positiveBalance + safe) / mise));
  const lastCoveredAbs = coveredAfter > 0 ? firstLine + coveredAfter - 1 : 0;
  const sheet = lastCoveredAbs > 0 ? Math.min(LIVRET_MONTHS, Math.ceil(lastCoveredAbs / SHEET_DAYS)) : null;
  const label = sheet !== null ? v.sheets[sheet - 1]?.shortLabel ?? null : null;
  return {
    amount: raw,
    valid: raw > 0,
    exceedsReste,
    resteBefore,
    linesCoveredAfter: coveredAfter,
    coversThroughLine: lastCoveredAbs,
    coversThroughSheet: sheet,
    coversThroughLabel: label,
    coversFullSheet: sheet !== null && lastCoveredAbs === sheet * SHEET_DAYS,
    partialAfter: Math.max(0, positiveBalance + Math.min(safe, resteBefore) - coveredAfter * mise),
    resteAfter: Math.max(0, resteBefore - safe),
  };
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
    effectiveStart: livret.effectiveStart,
    dailyAmount: livret.dailyAmount,
    balance: livret.balance,
    coveredLines: livret.coveredLines,
    payableLines: livret.payableLines,
    excusedLines: livret.excusedLines,
    lineDue: livret.lineDue,
    missedLines: livret.missedLines,
    currentSheet: livret.currentSheet,
    coveredThrough: livret.coveredThrough,
    advanceOptions: livret.advanceOptions,
    sheets: livret.sheets.map((s) => ({ ...s })),
    recap: { ...livret.recap },
  };
}

export type SerializedLivret = ReturnType<typeof serializeLivret>;
