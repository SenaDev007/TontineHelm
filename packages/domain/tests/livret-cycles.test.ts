// TontiHelm — tests des cycles courts paramétrables (décision n° 5, PARITE.md §8.14).
// Bornes exigées : 1 jour, mois d'arrivée proratisé, 372 (livret annuel inchangé).
// Le comportement à 372 doit rester BIT-IDENTIQUE au moteur historique — c'est
// l'objet des tests de non-régression (domain.regression.test.ts) ; ici on
// caractérise les durées NOUVELLES (1, 45, 62…) et les bornes de validation.
import { describe, expect, test } from "bun:test";
import {
  advancePreview,
  buildLivret,
  clampCycleDays,
  firstPayableLine,
  lineLabel,
  linePosition,
  livretTotal,
  monthStart,
  sheetsForCycleDays,
  sheetLastLine,
  sheetLength,
} from "../src/livret";

const MS_DAY = 24 * 60 * 60 * 1000;
const START = monthStart(new Date()); // 1er du mois courant
const ARRIVAL = START; // arrivée le 1er : aucune ligne excusée

function pb(cycleDays: number, dailyAmount = 500, createdAt = ARRIVAL) {
  return { dailyAmount, startsOn: START, createdAt, cycleDays };
}

describe("cycles courts — bornes et helpers", () => {
  test("clampCycleDays : repli 372 si absent, bornes 1..372", () => {
    expect(clampCycleDays(undefined)).toBe(372);
    expect(clampCycleDays(null)).toBe(372);
    expect(clampCycleDays(0)).toBe(1);
    expect(clampCycleDays(-10)).toBe(1);
    expect(clampCycleDays(400)).toBe(372);
    expect(clampCycleDays(372)).toBe(372);
    expect(clampCycleDays(45)).toBe(45);
    expect(clampCycleDays(45.9)).toBe(45); // plancher entier
  });

  test("sheetsForCycleDays : ceil(cycleDays / 31), dernière feuille partielle", () => {
    expect(sheetsForCycleDays(372)).toBe(12);
    expect(sheetsForCycleDays(31)).toBe(1);
    expect(sheetsForCycleDays(45)).toBe(2);
    expect(sheetsForCycleDays(62)).toBe(2);
    expect(sheetsForCycleDays(1)).toBe(1);
    expect(sheetsForCycleDays(63)).toBe(3);
  });

  test("sheetLength / sheetLastLine : la dernière ligne de CHAQUE feuille est l'entreprise", () => {
    // Cycle de 45 jours : feuille 1 pleine (31), feuille 2 partielle (14).
    expect(sheetLength(0, 45)).toBe(31);
    expect(sheetLength(1, 45)).toBe(14);
    expect(sheetLastLine(0, 45)).toBe(31);
    expect(sheetLastLine(1, 45)).toBe(45);
    // Cycle de 1 jour : UNE ligne, qui est la mise entreprise.
    expect(sheetLength(0, 1)).toBe(1);
    expect(sheetLastLine(0, 1)).toBe(1);
  });

  test("linePosition : marque entreprise sur la dernière ligne de chaque feuille", () => {
    expect(linePosition(31, 45).company).toBe(true);
    expect(linePosition(45, 45).company).toBe(true);
    expect(linePosition(44, 45).company).toBe(false);
    expect(linePosition(30, 45).company).toBe(false);
    expect(linePosition(1, 1).company).toBe(true);
    // Compatibilité : sans durée passée, la 31e de chaque feuille (372).
    expect(linePosition(372).company).toBe(true);
    expect(linePosition(31).company).toBe(true);
    expect(linePosition(30).company).toBe(false);
  });

  test("livretTotal / lineLabel : suivent la durée du cycle", () => {
    expect(livretTotal(500, 45)).toBe(22500);
    expect(livretTotal(500, 1)).toBe(500);
    expect(livretTotal(500)).toBe(186000); // 372 par défaut
    expect(lineLabel(45, START, 45)).toContain("Mise entreprise");
    expect(lineLabel(44, START, 45)).toContain("Ligne 13"); // feuille 2 : lignes 32..45 → 44 = position 13
    expect(lineLabel(31, START, 45)).toContain("Mise entreprise");
  });
});

describe("cycles courts — moteur buildLivret", () => {
  test("cycle de 1 jour : une feuille, une ligne (entreprise), complet dès la mise", () => {
    const v = buildLivret(pb(1), 0);
    expect(v.months).toBe(1);
    expect(v.cycleDays).toBe(1);
    expect(v.payableLines).toBe(1);
    expect(v.sheets).toHaveLength(1);
    expect(v.sheets[0].payable).toBe(1);
    // La seule ligne est la mise entreprise : tout va à l'entreprise.
    const full = buildLivret(pb(1), 500);
    expect(full.coveredLines).toBe(1);
    expect(full.recap.attendu).toBe(500);
    expect(full.recap.partEntreprise).toBe(500);
    expect(full.recap.partClient).toBe(0);
    expect(full.sheets[0].complete).toBe(true);
    expect(full.lineDue).toBe(2); // livret épuisé
  });

  test("cycle de 45 jours : 2 feuilles (31 + 14), entreprises aux lignes 31 et 45", () => {
    const v = buildLivret(pb(45), 0);
    expect(v.months).toBe(2);
    expect(v.payableLines).toBe(45);
    expect(v.sheets[0].payable).toBe(31);
    expect(v.sheets[1].payable).toBe(14);
    expect(v.recap.attendu).toBe(45 * 500);
    // Feuille 1 intégralement réglée (31 mises) : 30 client + 1 entreprise.
    const s1 = buildLivret(pb(45), 31 * 500);
    expect(s1.sheets[0].complete).toBe(true);
    expect(s1.sheets[0].partClient).toBe(30 * 500);
    expect(s1.sheets[0].partEntreprise).toBe(500);
    expect(s1.sheets[1].encaisse).toBe(0);
    // Tout le cycle réglé : 43 lignes client (45 − 2 mises entreprise) + 2 entreprise.
    const s2 = buildLivret(pb(45), 45 * 500);
    expect(s2.coveredLines).toBe(45);
    expect(s2.recap.partClient).toBe(43 * 500);
    expect(s2.recap.partEntreprise).toBe(2 * 500); // lignes 31 ET 45
    expect(s2.sheets[1].complete).toBe(true);
    expect(s2.lineDue).toBe(46);
  });

  test("avances mensuelles d'un cycle court : la cible est la fin de la feuille partielle", () => {
    const v = buildLivret(pb(45), 0);
    expect(v.advanceOptions).toHaveLength(2);
    // Montants CUMULATIFS depuis un solde nul (même sémantique que le livret annuel).
    expect(v.advanceOptions[0].sheet).toBe(1);
    expect(v.advanceOptions[0].amount).toBe(31 * 500); // couvre jusqu'à la fin de la feuille 1
    expect(v.advanceOptions[1].sheet).toBe(2);
    expect(v.advanceOptions[1].amount).toBe(45 * 500); // couvre TOUT le cycle (fin de feuille 2)
    expect(v.advanceOptions[1].resteAfter).toBe(0);
    // Aucune option au-delà du cycle.
    const one = buildLivret(pb(1), 0);
    expect(one.advanceOptions).toHaveLength(1);
    expect(one.advanceOptions[0].amount).toBe(500);
  });

  test("mois d'arrivée proratisé en cycle court : lignes excusées avant l'arrivée", () => {
    // Arrivée le 17 du mois : lignes 1..16 excusées, première encaissable = 17.
    const arrival = new Date(START.getTime() + 16 * MS_DAY);
    const passbook = pb(45, 500, arrival);
    expect(firstPayableLine(passbook)).toBe(17);
    // La veille de l'arrivée : RIEN n'est dû, rien de manqué (règle d'équité).
    const before = buildLivret(passbook, 0, new Date(START.getTime() + 15 * MS_DAY));
    expect(before.excusedLines).toBe(16);
    expect(before.payableLines).toBe(45 - 16);
    expect(before.recap.attendu).toBe((45 - 16) * 500);
    expect(before.missedLines).toBe(0);
    expect(before.sheets[0].excused).toBe(16);
    expect(before.sheets[0].payable).toBe(15);
    // Le jour même de l'arrivée : SA ligne est due (une seule, jamais avant).
    const onArrival = buildLivret(passbook, 0, arrival);
    expect(onArrival.sheets[0].elapsedLines).toBe(1);
    expect(onArrival.missedLines).toBe(1); // due au jour même, non couverte
  });

  test("échéances d'une feuille partielle : plafonnées à sa longueur (cycle 45)", () => {
    // À la fin du 2e mois du cycle (feuille partielle de 14 lignes), tout est échu.
    const today = new Date(START.getTime() + 62 * MS_DAY); // 2 mois + 1 jour
    const v = buildLivret(pb(45), 0, today);
    expect(v.missedLines).toBe(45); // tout le cycle est dû, rien versé
    expect(v.sheets[1].elapsedLines).toBe(14); // pas 31 : la feuille s'arrête à 14
  });

  test("372 explicite ≡ champ absent (livret annuel inchangé)", () => {
    const a = buildLivret({ dailyAmount: 500, startsOn: START, createdAt: ARRIVAL }, 3000);
    const b = buildLivret({ dailyAmount: 500, startsOn: START, createdAt: ARRIVAL, cycleDays: 372 }, 3000);
    expect(a).toEqual(b);
  });
});

describe("cycles courts — avance partielle (advancePreview)", () => {
  test("aperçu sur un cycle de 45 jours : feuilles et fin de feuille correctes", () => {
    const base = {
      dailyAmount: 500,
      balance: 0,
      coveredLines: 0,
      payableLines: 45,
      lineDue: 1,
      attendu: 45 * 500,
      sheets: [{ shortLabel: "mois 1" }, { shortLabel: "mois 2" }],
      cycleDays: 45,
    };
    // 31 mises : couvre exactement la feuille 1 (fin de feuille).
    const full1 = advancePreview(base, 31 * 500);
    expect(full1.coversThroughSheet).toBe(1);
    expect(full1.coversFullSheet).toBe(true);
    expect(full1.resteAfter).toBe(14 * 500);
    // 25 mises : feuille 1 entamée, ligne 25, pas de fin de feuille.
    const part = advancePreview(base, 25 * 500);
    expect(part.coversThroughSheet).toBe(1);
    expect(part.coversThroughLine).toBe(25);
    expect(part.coversFullSheet).toBe(false);
    // 45 mises : tout le cycle, fin de la feuille 2 (partielle).
    const all = advancePreview(base, 45 * 500);
    expect(all.coversThroughSheet).toBe(2);
    expect(all.coversFullSheet).toBe(true);
    expect(all.resteAfter).toBe(0);
  });

  test("aperçu sans cycleDays : comportement livret annuel conservé", () => {
    const base = {
      dailyAmount: 500,
      balance: 0,
      coveredLines: 0,
      payableLines: 372,
      lineDue: 1,
      attendu: 372 * 500,
      sheets: Array.from({ length: 12 }, () => ({ shortLabel: "x" })),
    };
    const r = advancePreview(base, 31 * 500);
    expect(r.coversThroughSheet).toBe(1);
    expect(r.coversFullSheet).toBe(true);
    expect(r.coversThroughLine).toBe(31);
  });

  test("cycle de 1 jour : la mise unique est signalée hors bornes après paiement", () => {
    const base = {
      dailyAmount: 500,
      balance: 500,
      coveredLines: 1,
      payableLines: 1,
      lineDue: 2,
      attendu: 500,
      sheets: [{ shortLabel: "seul mois" }],
      cycleDays: 1,
    };
    const r = advancePreview(base, 500);
    expect(r.exceedsReste).toBe(true); // plus rien à prendre
    expect(r.resteBefore).toBe(0);
    expect(r.valid).toBe(true);
  });
});
