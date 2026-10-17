// Tests de non-régression — TontiHelm phase 1 (extraction de packages/domain).
// Principe du brief : ces tests caractérisent le comportement ACTUEL du web
// (source de vérité, PARITE.md §4) AVANT toute extraction. Ils doivent rester
// verts avant, pendant et après l'extraction vers packages/domain.
// Exécution : bun test tests/domain.regression.test.ts (depuis packages/domain/).

import { describe, it, expect } from "bun:test";
import {
  formatFCFA,
  formatNumber,
  passbookBalance,
  paidDays,
  elapsedDays,
  missedDays,
  isLate,
  cycleCommission,
  currentDayIndex,
  closingGap,
  maxCollectionAmount,
  buildDayLedger,
  effectiveDay,
  dayIndexOf,
} from "../src/domain";
import {
  LIVRET_MONTHS,
  SHEET_DAYS,
  LIVRET_DAYS,
  CLIENT_LINES_PER_SHEET,
  monthStart,
  livretStart,
  addMonths,
  monthKey,
  monthsBetween,
  daysInMonth,
  monthLabel,
  effectiveStartDay,
  firstPayableLine,
  buildLivret,
  linePosition,
  lineLabel,
  livretTotal,
  serializeLivret,
} from "../src/livret";
import { PLANS, planOf } from "../src/plans";

const day = (iso: string) => new Date(iso);

// ─────────────────────────────────────────────────────────────────────────────
// domain.ts — formules unitaires
// ─────────────────────────────────────────────────────────────────────────────

describe("domain — formatage", () => {
  it("formatFCFA : une seule fonction pour toute l'application (fr-FR + FCFA)", () => {
    expect(formatFCFA(0)).toBe("0\u00A0FCFA");
    expect(formatFCFA(15500)).toBe(new Intl.NumberFormat("fr-FR").format(15500) + "\u00A0FCFA");
    expect(formatFCFA(2000000)).toBe(new Intl.NumberFormat("fr-FR").format(2000000) + "\u00A0FCFA");
    expect(formatNumber(15500)).toBe(new Intl.NumberFormat("fr-FR").format(15500));
  });
});

describe("domain — solde et jours payés", () => {
  it("solde = somme des montants, annulations négatives incluses", () => {
    expect(passbookBalance([])).toBe(0);
    expect(passbookBalance([{ amount: 500 }, { amount: 500 }, { amount: -500 }])).toBe(500);
    expect(passbookBalance([{ amount: 15500 }])).toBe(15500);
  });

  it("jours payés = plancher(solde / mise), plancher à zéro, mise nulle protégée", () => {
    expect(paidDays(1500, 500)).toBe(3);
    expect(paidDays(1499, 500)).toBe(2);
    expect(paidDays(0, 500)).toBe(0);
    expect(paidDays(-500, 500)).toBe(0);
    expect(paidDays(100, 0)).toBe(0);
  });
});

describe("domain — jours écoulés, manqués, retard", () => {
  const pb = { dailyAmount: 500, cycleDays: 31, startsOn: day("2026-10-01T00:00:00Z") };

  it("écoulés : +1 le jour même, 0 avant, plafonné au cycle", () => {
    expect(elapsedDays(pb, day("2026-10-01T00:00:00Z"))).toBe(1);
    expect(elapsedDays(pb, day("2026-10-18T00:00:00Z"))).toBe(18);
    expect(elapsedDays(pb, day("2026-09-25T00:00:00Z"))).toBe(0);
    expect(elapsedDays(pb, day("2026-12-31T00:00:00Z"))).toBe(31);
  });

  it("manqués = écoulés − payés, plancher 0 ; retard au seuil (3 par défaut)", () => {
    expect(missedDays(pb, 7500, day("2026-10-18T00:00:00Z"))).toBe(3); // 18 − 15
    expect(missedDays(pb, 8000, day("2026-10-18T00:00:00Z"))).toBe(2);
    expect(isLate(pb, 7500, 3, day("2026-10-18T00:00:00Z"))).toBe(true);
    expect(isLate(pb, 8000, 3, day("2026-10-18T00:00:00Z"))).toBe(false);
    expect(currentDayIndex(pb, day("2026-10-18T00:00:00Z"))).toBe(18);
  });
});

describe("domain — commission, écart de caisse, plafond", () => {
  it("commission règle jours : commissionDays × mise (31 j à 500 → 500)", () => {
    expect(cycleCommission(500, 31, 1)).toBe(500);
    expect(cycleCommission(500, 31, 2)).toBe(1000);
    expect(cycleCommission(500, 372)).toBe(500); // commissionDays par défaut = 1
  });

  it("écart de caisse = déclaré − attendu (hors mobile money)", () => {
    expect(closingGap(10000, 10000)).toBe(0);
    expect(closingGap(9500, 10000)).toBe(-500);
  });

  it("plafond d'encaissement : restant du cycle, +1 mise si avance", () => {
    const pb = { dailyAmount: 500, cycleDays: 31, startsOn: day("2026-10-01T00:00:00Z") };
    expect(maxCollectionAmount(pb, 5000, false)).toBe(10500); // 15 500 − 5 000
    expect(maxCollectionAmount(pb, 15500, false)).toBe(0);
    expect(maxCollectionAmount(pb, 20000, false)).toBe(0);
    expect(maxCollectionAmount(pb, 5000, true)).toBe(16000); // 15 500 + une mise
  });
});

describe("domain — registre par journée (buildDayLedger)", () => {
  it("marquage séquentiel : payer 3 mises d'un coup marque 3 journées ; annulation retirée de la journée d'origine", () => {
    const pb = { dailyAmount: 500, cycleDays: 4, startsOn: day("2026-10-01T00:00:00Z") };
    const entries = [
      { id: "a", amount: 1500, coversOn: day("2026-10-01T00:00:00Z"), collectedAt: day("2026-10-01T00:00:00Z"), reversesId: null },
      { id: "b", amount: 500, coversOn: null, collectedAt: day("2026-10-02T00:00:00Z"), reversesId: null },
      { id: "c", amount: -500, coversOn: null, collectedAt: day("2026-10-03T00:00:00Z"), reversesId: "a" },
    ];
    const ledger = buildDayLedger(pb, entries);
    expect(ledger.map((d) => d.net)).toEqual([500, 500, 500, 0]);
    expect(ledger[0].date.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("montant hors cycle : remplit les premières journées libres", () => {
    const pb = { dailyAmount: 500, cycleDays: 3, startsOn: day("2026-10-01T00:00:00Z") };
    const entries = [
      { id: "d", amount: 500, coversOn: null, collectedAt: day("2026-09-01T00:00:00Z"), reversesId: null },
    ];
    expect(buildDayLedger(pb, entries).map((d) => d.net)).toEqual([500, 0, 0]);
  });

  it("annulation non localisable : retirée depuis la dernière journée dotée", () => {
    const pb = { dailyAmount: 500, cycleDays: 2, startsOn: day("2026-10-01T00:00:00Z") };
    const entries = [
      { id: "f", amount: 500, coversOn: day("2026-10-01T00:00:00Z"), collectedAt: day("2026-10-01T00:00:00Z"), reversesId: null },
      { id: "g", amount: -200, coversOn: null, collectedAt: day("2026-10-02T00:00:00Z"), reversesId: null },
    ];
    expect(buildDayLedger(pb, entries).map((d) => d.net)).toEqual([300, 0]);
  });

  it("effectiveDay et dayIndexOf : minuit UTC, indice 0..n-1 ou -1 hors cycle", () => {
    const pb = { dailyAmount: 500, cycleDays: 5, startsOn: day("2026-10-01T00:00:00Z") };
    expect(effectiveDay(day("2026-10-03T15:00:00Z"), day("2026-10-05T00:00:00Z")).toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(effectiveDay(null, day("2026-10-05T09:30:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(dayIndexOf(pb, day("2026-10-03T00:00:00Z"))).toBe(2);
    expect(dayIndexOf(pb, day("2026-09-30T00:00:00Z"))).toBe(-1);
    expect(dayIndexOf(pb, day("2026-10-06T00:00:00Z"))).toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// livret.ts — moteur du livret annuel (12 feuilles × 31 lignes)
// ─────────────────────────────────────────────────────────────────────────────

describe("livret — constantes et calendrier", () => {
  it("12 feuilles de 31 lignes = 372 lignes, 30 lignes client par feuille", () => {
    expect(LIVRET_MONTHS).toBe(12);
    expect(SHEET_DAYS).toBe(31);
    expect(LIVRET_DAYS).toBe(372);
    expect(CLIENT_LINES_PER_SHEET).toBe(30);
    expect(livretTotal(500)).toBe(186000);
  });

  it("mois UTC : débuts, clés, écarts, durées réelles, libellés français", () => {
    expect(monthStart(day("2026-10-17T12:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(livretStart(day("2026-10-17T12:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(addMonths(day("2026-10-01T00:00:00Z"), 2).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(monthKey(day("2026-10-17T00:00:00Z"))).toBe("2026-10");
    expect(monthsBetween(day("2026-10-01T00:00:00Z"), day("2027-09-01T00:00:00Z"))).toBe(11);
    expect(daysInMonth(2026, 9)).toBe(31); // octobre
    expect(daysInMonth(2027, 1)).toBe(28); // février 2027
    expect(daysInMonth(2028, 1)).toBe(29); // février 2028 bissextile
    expect(monthLabel(2026, 9)).toBe("octobre 2026");
    expect(monthLabel(2026, 9, true)).toBe("oct. 2026");
  });
});

describe("livret — règle d'équité (arrivée en cours de mois)", () => {
  it("effectiveStartDay : max(1er du mois, jour de création)", () => {
    const base = { dailyAmount: 500, startsOn: day("2026-10-01T00:00:00Z") };
    expect(effectiveStartDay({ ...base, createdAt: day("2026-10-17T00:00:00Z") }).toISOString()).toBe("2026-10-17T00:00:00.000Z");
    expect(effectiveStartDay({ ...base, createdAt: day("2026-10-01T00:00:00Z") }).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(effectiveStartDay({ ...base, createdAt: null }).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(effectiveStartDay({ ...base, createdAt: day("2026-09-20T00:00:00Z") }).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("firstPayableLine : ligne du jour d'arrivée ; lignes précédentes excusées", () => {
    const base = { dailyAmount: 500, startsOn: day("2026-10-01T00:00:00Z") };
    expect(firstPayableLine({ ...base, createdAt: day("2026-10-17T00:00:00Z") })).toBe(17);
    expect(firstPayableLine({ ...base, createdAt: day("2026-11-05T00:00:00Z") })).toBe(36); // feuille 2, ligne 5
    expect(firstPayableLine({ ...base })).toBe(1);
  });
});

describe("livret — cas CANONIQUE du brief (31 jours à 500 FCFA = une feuille)", () => {
  it("15 500 cotisés, 500 de part entreprise, 15 000 au client — exactement une feuille mensuelle", () => {
    const pb = { dailyAmount: 500, startsOn: day("2026-10-01T00:00:00Z"), createdAt: day("2026-10-01T00:00:00Z") };
    const v = buildLivret(pb, 15500, day("2026-10-31T00:00:00Z"));
    const s1 = v.sheets[0];
    expect(s1.attendu).toBe(15500);
    expect(s1.encaisse).toBe(15500);
    expect(s1.partClient).toBe(15000);
    expect(s1.partEntreprise).toBe(500);
    expect(s1.complete).toBe(true);
    expect(s1.excused).toBe(0);
    expect(s1.payable).toBe(31);
    expect(v.recap.attendu).toBe(186000);
    expect(v.recap.encaisse).toBe(15500);
    expect(v.recap.reste).toBe(170500);
    expect(v.recap.partEntreprise).toBe(500);
    expect(v.recap.partClient).toBe(15000);
    expect(v.recap.sheetsComplete).toBe(1);
    expect(v.recap.missedLines).toBe(0);
    expect(v.coveredLines).toBe(31);
    expect(v.payableLines).toBe(372);
    expect(v.excusedLines).toBe(0);
    expect(v.lineDue).toBe(32);
    expect(v.coveredThrough).toEqual({ sheet: 1, label: "octobre 2026" });
    expect(v.currentSheet).toBe(1);
    // Avances : la feuille 1 est réglée → première option = couvrir jusqu'à la feuille 2
    expect(v.advanceOptions.length).toBe(11);
    expect(v.advanceOptions[0]).toEqual({ sheet: 2, label: "nov. 2026", amount: 15500, resteAfter: 155000 });
  });
});

describe("livret — prorata du mois d'arrivée (lignes excusées)", () => {
  it("arrivée le 17 : 16 lignes excusées, 15 payables sur la feuille 1, attendu 7 500", () => {
    const pb = { dailyAmount: 500, startsOn: day("2026-10-01T00:00:00Z"), createdAt: day("2026-10-17T00:00:00Z") };
    const v = buildLivret(pb, 0, day("2026-10-17T00:00:00Z"));
    const s1 = v.sheets[0];
    expect(s1.excused).toBe(16);
    expect(s1.payable).toBe(15);
    expect(s1.attendu).toBe(7500);
    expect(v.excusedLines).toBe(16);
    expect(v.payableLines).toBe(356);
    expect(v.recap.attendu).toBe(178000);
    expect(v.effectiveStart).toBe("2026-10-17");
    expect(v.startsOn).toBe("2026-10-01");
    expect(v.lineDue).toBe(17);
    // Le jour même de l'arrivée : 1 ligne échue, non couverte → 1 manquée (retard au seuil 3)
    expect(v.recap.missedLines).toBe(1);
    // Avance « ce mois » : couvrir les 15 lignes payables de la feuille d'arrivée
    expect(v.advanceOptions[0]).toEqual({ sheet: 1, label: "oct. 2026", amount: 7500, resteAfter: 170500 });
    expect(v.advanceOptions.length).toBe(12);
  });

  it("jamais en retard pour des jours antérieurs à son arrivée (aujourd'hui avant l'arrivée)", () => {
    const pb = { dailyAmount: 500, startsOn: day("2026-10-01T00:00:00Z"), createdAt: day("2026-10-17T00:00:00Z") };
    const v = buildLivret(pb, 0, day("2026-10-10T00:00:00Z"));
    expect(v.sheets[0].elapsedLines).toBe(0);
    expect(v.recap.missedLines).toBe(0);
  });
});

describe("livret — avance et rattrapage", () => {
  it("payer au-delà des échéances constitue une avance (5 jours échus, 10 mises versées)", () => {
    const pb = { dailyAmount: 500, startsOn: day("2026-10-01T00:00:00Z"), createdAt: day("2026-10-01T00:00:00Z") };
    const v = buildLivret(pb, 5000, day("2026-10-05T00:00:00Z"));
    const s1 = v.sheets[0];
    expect(s1.encaisse).toBe(5000);
    expect(s1.elapsedLines).toBe(5);
    expect(s1.avance).toBe(2500);
    expect(s1.reste).toBe(10500);
    expect(v.recap.avanceTotale).toBe(2500);
    expect(v.recap.missedLines).toBe(0);
    expect(v.lineDue).toBe(11);
    expect(v.coveredThrough).toEqual({ sheet: 1, label: "octobre 2026" });
    expect(v.advanceOptions[0]).toEqual({ sheet: 1, label: "oct. 2026", amount: 10500, resteAfter: 170500 });
    expect(v.advanceOptions[1]).toEqual({ sheet: 2, label: "nov. 2026", amount: 26000, resteAfter: 155000 });
  });

  it("retard : lignes échues non couvertes comptées depuis l'arrivée", () => {
    const pb = { dailyAmount: 500, startsOn: day("2026-10-01T00:00:00Z"), createdAt: day("2026-10-01T00:00:00Z") };
    const v = buildLivret(pb, 1500, day("2026-10-10T00:00:00Z"));
    expect(v.sheets[0].elapsedLines).toBe(10);
    expect(v.coveredLines).toBe(3);
    expect(v.recap.missedLines).toBe(7);
  });
});

describe("livret — lignes et sérialisation", () => {
  it("position des lignes : 31e de chaque feuille = mise entreprise", () => {
    expect(linePosition(1)).toEqual({ sheet: 1, lineInSheet: 1, company: false });
    expect(linePosition(31)).toEqual({ sheet: 1, lineInSheet: 31, company: true });
    expect(linePosition(32)).toEqual({ sheet: 2, lineInSheet: 1, company: false });
    expect(linePosition(372)).toEqual({ sheet: 12, lineInSheet: 31, company: true });
    expect(lineLabel(31, day("2026-10-01T00:00:00Z"))).toBe("Mise entreprise · oct. 2026");
    expect(lineLabel(12, day("2026-10-01T00:00:00Z"))).toBe("Ligne 12 · oct. 2026");
  });

  it("serializeLivret : structure JSON complète (12 feuilles + récap)", () => {
    const pb = { dailyAmount: 500, startsOn: day("2026-10-01T00:00:00Z"), createdAt: day("2026-10-01T00:00:00Z") };
    const s = serializeLivret(buildLivret(pb, 0, day("2026-10-01T00:00:00Z")));
    expect(s.months).toBe(12);
    expect(s.startsOn).toBe("2026-10-01");
    expect(s.effectiveStart).toBe("2026-10-01");
    expect(s.sheets.length).toBe(12);
    expect(s.sheets[0].key).toBe("2026-10");
    expect(s.sheets[11].key).toBe("2027-09");
    expect(s.recap.attendu).toBe(186000);
    expect(Object.keys(s.recap)).toContain("partClient");
    expect(Object.keys(s.recap)).toContain("partEntreprise");
    // JSONisable sans perte
    expect(() => JSON.stringify(s)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// plans.ts — paliers d'abonnement
// ─────────────────────────────────────────────────────────────────────────────

describe("plans — paliers et repli", () => {
  it("trois paliers aux chiffres exacts (source unique de vérité)", () => {
    expect(PLANS.demarrage).toEqual({ key: "demarrage", label: "Démarrage", price: 15000, agents: 1, contributors: 50, reminders: false });
    expect(PLANS.pro).toEqual({ key: "pro", label: "Pro", price: 35000, agents: 10, contributors: 300, reminders: true });
    expect(PLANS.institution).toEqual({ key: "institution", label: "Institution", price: 75000, agents: 40, contributors: 3000, reminders: true });
  });

  it("planOf : palier inconnu ou absent → Démarrage", () => {
    expect(planOf(null).key).toBe("demarrage");
    expect(planOf("inconnu").key).toBe("demarrage");
    expect(planOf("pro").label).toBe("Pro");
  });
});
