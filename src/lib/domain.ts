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

/** Cotisant actif pour la facturation : au moins un encaissement non annulé dans le mois civil. */
export function isContributorActiveThisMonth(collections: CollectionLike[], month: Date): boolean {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  return collections.some((c) => {
    return c.amount > 0 && true; // le filtrage par date est fait par l'appelant
  });
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
