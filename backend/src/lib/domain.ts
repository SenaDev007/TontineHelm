// TontiHelm — paquet domain : règles métier pures (cahier des charges §14.6)
// Aucune dépendance externe. Tous les montants sont des entiers (FCFA).

/** Format des montants : une seule fonction pour toute l'application. */
export const formatFCFA = (n: number): string =>
  new Intl.NumberFormat("fr-FR").format(n) + "\u00A0FCFA";

/** Format compact sans devise (tableaux denses). */
export const formatNumber = (n: number): string =>
  new Intl.NumberFormat("fr-FR").format(n);

export interface PassbookLike {
  dailyAmount: number;
  cycleDays: number;
  startsOn: Date;
}

export interface CollectionLike {
  amount: number; // positif ou négatif (annulation)
}

/** Solde d'un carnet : somme des montants, annulations incluses. */
export function passbookBalance(collections: CollectionLike[]): number {
  return collections.reduce((sum, c) => sum + c.amount, 0);
}

/** Jours payés : solde divisé par la mise journalière, arrondi à l'entier inférieur. */
export function paidDays(balance: number, dailyAmount: number): number {
  if (dailyAmount <= 0) return 0;
  return Math.max(0, Math.floor(balance / dailyAmount));
}

/** Jours écoulés depuis le début du cycle (plafonné à la durée du cycle). */
export function elapsedDays(passbook: PassbookLike, today: Date = new Date()): number {
  const start = new Date(passbook.startsOn);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.floor((today.getTime() - start.getTime()) / msPerDay) + 1;
  return Math.min(Math.max(diff, 0), passbook.cycleDays);
}

/** Jours manqués : jours écoulés moins jours payés, plancher à zéro. */
export function missedDays(passbook: PassbookLike, balance: number, today: Date = new Date()): number {
  return Math.max(0, elapsedDays(passbook, today) - paidDays(balance, passbook.dailyAmount));
}

/** Statut en retard : jours manqués supérieurs ou égaux au seuil (3 par défaut). */
export function isLate(passbook: PassbookLike, balance: number, threshold = 3, today: Date = new Date()): boolean {
  return missedDays(passbook, balance, today) >= threshold;
}

/**
 * Commission de fin de cycle, règle jours : valeur × mise journalière.
 * Exemple : 31 jours à 500 FCFA → 15 500 FCFA cotisés, commission 500 FCFA, restitué 15 000 FCFA.
 */
export function cycleCommission(dailyAmount: number, cycleDays: number, commissionDays = 1): number {
  return commissionDays * dailyAmount;
}

/** Jour du cycle au moment d'un encaissement (indexé à partir de 1). */
export function currentDayIndex(passbook: PassbookLike, today: Date = new Date()): number {
  return elapsedDays(passbook, today);
}

/** Écart de clôture : espèces déclarées moins espèces attendues (hors mobile money). */
export function closingGap(declaredCash: number, expectedCash: number): number {
  return declaredCash - expectedCash;
}

/** Plafond d'un encaissement : jamais au-delà du montant restant du cycle, sauf avance explicite. */
export function maxCollectionAmount(
  passbook: PassbookLike,
  balance: number,
  advanceAllowed = false
): number {
  const cycleTotal = passbook.dailyAmount * passbook.cycleDays;
  if (advanceAllowed) return cycleTotal + passbook.dailyAmount; // un jour d'avance au maximum
  return Math.max(0, cycleTotal - balance);
}

// ── Registre par journée (collecte multi-jours) ──
// Un cotisant peut régler plusieurs journées d'un coup : aujourd'hui, demain,
// après-demain… sans limite autre que les bornes du cycle. Chaque écriture
// porte la journée qu'elle couvre (coversOn) ; le registre répartit les
// montants sur les vraies dates calendaires du cycle.

export interface LedgerEntry {
  id: string;
  amount: number; // positif ; négatif si annulation
  coversOn: Date | null; // journée explicitement couverte
  collectedAt: Date;
  reversesId: string | null;
}

export interface DayLedgerItem {
  date: Date; // journée calendaire du cycle (minuit UTC)
  net: number; // net attribué à cette journée après répartition et report d'excédent
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Minuit UTC de la journée calendaire d'une date. */
function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Registre des journées d'un cycle :
 *  1. chaque encaissement se pose sur sa journée couverte explicite (coversOn),
 *     à défaut sur sa date d'encaissement si elle tombe dans le cycle ;
 *  2. une annulation se retire de la journée de l'écriture d'origine ;
 *  3. l'excédent d'une journée est reporté vers l'avant (une journée marquée
 *     = une mise ; payer davantage avance le marquage des jours suivants).
 * Les montants non attribuables (hors cycle) remplissent les premières
 * journées libres — cohérent avec « jours payés = solde / mise ».
 */
export function buildDayLedger(passbook: PassbookLike, entries: LedgerEntry[]): DayLedgerItem[] {
  const n = passbook.cycleDays;
  if (n <= 0) return [];
  const startMs = utcDay(passbook.startsOn);
  const nets = new Array<number>(n).fill(0);
  const idxOf = (d: Date): number => Math.round((utcDay(d) - startMs) / MS_PER_DAY);
  const inCycle = (i: number) => Number.isFinite(i) && i >= 0 && i < n;

  // 1. Encaissements : journée couverte explicite, sinon date d'encaissement.
  const deferred: number[] = [];
  for (const e of entries) {
    if (e.amount <= 0) continue;
    const i = e.coversOn ? idxOf(e.coversOn) : idxOf(e.collectedAt);
    if (inCycle(i)) nets[i] += e.amount;
    else deferred.push(e.amount);
  }

  // 2. Annulations : même journée que l'écriture d'origine.
  const byId = new Map(entries.map((e) => [e.id, e]));
  const orphanNegatives: number[] = [];
  for (const e of entries) {
    if (e.amount >= 0) continue;
    let i = Number.NaN;
    if (e.reversesId) {
      const orig = byId.get(e.reversesId);
      if (orig) i = orig.coversOn ? idxOf(orig.coversOn) : idxOf(orig.collectedAt);
    }
    if (inCycle(i)) nets[i] += e.amount;
    else orphanNegatives.push(e.amount);
  }

  // 3. Annulations non localisables : retirées depuis la dernière journée dotée.
  for (const amt of orphanNegatives) {
    let rest = -amt;
    for (let j = n - 1; j >= 0 && rest > 0; j--) {
      const take = Math.min(Math.max(nets[j], 0), rest);
      nets[j] -= take;
      rest -= take;
    }
  }

  // 4. Montants hors cycle : premières journées libres, puis la dernière.
  for (const amt of deferred) {
    let rest = amt;
    for (let j = 0; j < n && rest > 0; j++) {
      const put = Math.min(Math.max(0, passbook.dailyAmount - nets[j]), rest);
      nets[j] += put;
      rest -= put;
    }
    if (rest > 0) nets[n - 1] += rest;
  }

  // 5. Report de l'excédent vers l'avant : une journée marquée = une mise.
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const v = nets[i] + carry;
    if (v > passbook.dailyAmount) {
      nets[i] = passbook.dailyAmount;
      carry = v - passbook.dailyAmount;
    } else {
      nets[i] = v;
      carry = 0;
    }
  }
  if (carry > 0) nets[n - 1] += carry;

  return nets.map((net, i) => ({ date: new Date(startMs + i * MS_PER_DAY), net }));
}

/** Journée (minuit UTC) d'une écriture : coversOn s'il existe, sinon collectedAt. */
export function effectiveDay(coversOn: Date | null, collectedAt: Date): Date {
  return coversOn ? new Date(utcDay(coversOn)) : new Date(utcDay(collectedAt));
}

/** Indice de journée du cycle (0..cycleDays-1) d'une date, ou -1 si hors cycle. */
export function dayIndexOf(passbook: PassbookLike, day: Date): number {
  const i = Math.round((utcDay(day) - utcDay(passbook.startsOn)) / MS_PER_DAY);
  return inCycleBounds(i, passbook.cycleDays) ? i : -1;
}

function inCycleBounds(i: number, cycleDays: number): boolean {
  return Number.isFinite(i) && i >= 0 && i < cycleDays;
}
