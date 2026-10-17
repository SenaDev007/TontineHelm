// TontiHelm — tests du moteur livret (2026-10-17) :
// 1) personne n'est en retard pour les jours antérieurs à son arrivée ;
// 2) avance/reste par mois + avances mensuelles calculées automatiquement ;
// 3) comportement inchangé quand le cotisant arrive le 1er du mois.
import { describe, expect, test } from "bun:test";
import { buildLivret, firstPayableLine } from "../src/lib/livret";

const OCT = (day: number) => new Date(Date.UTC(2026, 9, day, 9, 30)); // 9h30 UTC : le jour J est déjà commencé

describe("livret — arrivée en cours de mois", () => {
  test("première ligne encaissable = jour d'arrivée (17 octobre)", () => {
    const pb = {
      dailyAmount: 500,
      startsOn: new Date("2026-10-01T10:00:00Z"),
      createdAt: new Date("2026-10-17T10:00:00Z"),
    };
    expect(firstPayableLine(pb)).toBe(17);
    const livret = buildLivret(pb, 0, OCT(17));
    expect(livret.excusedLines).toBe(16);
    expect(livret.payableLines).toBe(372 - 16);
    expect(livret.lineDue).toBe(17);
  });

  test("créé le 17, AUCUNE ligne en retard le jour même (l'ancien bug affichait 16)", () => {
    const pb = {
      dailyAmount: 500,
      startsOn: new Date("2026-10-01T10:00:00Z"),
      createdAt: new Date("2026-10-17T10:00:00Z"),
    };
    const livret = buildLivret(pb, 0, OCT(17));
    expect(livret.missedLines).toBe(1); // uniquement la ligne du jour, pas encore encaissée
    expect(livret.recap.attendu).toBe(500 * (372 - 16)); // attendu proratisé
    expect(livret.sheets[0].excused).toBe(16);
    expect(livret.sheets[0].attendu).toBe(500 * 15);
    expect(livret.sheets[0].elapsedLines).toBe(1);
  });

  test("créé le 17, quatre mises versées : reste 1 ligne due, pas 13 retards", () => {
    const pb = {
      dailyAmount: 500,
      startsOn: new Date("2026-10-01T10:00:00Z"),
      createdAt: new Date("2026-10-17T10:00:00Z"),
    };
    const livret = buildLivret(pb, 2000, OCT(21));
    // 5 lignes échues (17→21) − 4 couvertes = 1 ; plus AUCUNE trace des 16 lignes d'avant.
    expect(livret.missedLines).toBe(1);
    expect(livret.coveredLines).toBe(4);
    expect(livret.lineDue).toBe(21); // ligne absolue : 17 + 4
    expect(livret.sheets[0].coveredLines).toBe(4);
  });

  test("arrivée le 1er : comportement inchangé (aucune ligne excusée)", () => {
    const pb = {
      dailyAmount: 500,
      startsOn: new Date("2026-10-01T10:00:00Z"),
      createdAt: new Date("2026-10-01T08:00:00Z"),
    };
    const livret = buildLivret(pb, 0, OCT(17));
    expect(livret.excusedLines).toBe(0);
    expect(livret.payableLines).toBe(372);
    expect(livret.missedLines).toBe(17);
    expect(livret.recap.attendu).toBe(500 * 372);
  });

  test("sans createdAt (anciens appels) : repli sur le 1er du mois, sans crash", () => {
    const livret = buildLivret({ dailyAmount: 500, startsOn: new Date("2026-10-01T10:00:00Z") }, 0, OCT(17));
    expect(livret.excusedLines).toBe(0);
    expect(livret.missedLines).toBe(17);
  });
});

describe("livret — avance et reste par mois", () => {
  test("avance mensuelle : options calculées, montant exact et reste à prendre", () => {
    const pb = {
      dailyAmount: 500,
      startsOn: new Date("2026-10-01T10:00:00Z"),
      createdAt: new Date("2026-10-17T10:00:00Z"),
    };
    const livret = buildLivret(pb, 0, OCT(17));
    // Options : fin oct. (15 lignes restantes du mois) puis chaque mois suivant.
    const oct = livret.advanceOptions.find((o) => o.sheet === 1);
    const nov = livret.advanceOptions.find((o) => o.sheet === 2);
    expect(oct).toBeDefined();
    expect(nov).toBeDefined();
    // Fin octobre : lignes 17..31 = 15 mises = 7 500.
    expect(oct!.amount).toBe(7500);
    expect(oct!.resteAfter).toBe(500 * (372 - 16) - 7500);
    // Fin novembre : 15 (oct.) + 31 (nov.) = 46 mises = 23 000.
    expect(nov!.amount).toBe(23000);
    // Dernière option : fin sept. 2027, reste 0 après.
    const last = livret.advanceOptions[livret.advanceOptions.length - 1];
    expect(last.sheet).toBe(12);
    expect(last.amount).toBe(500 * (372 - 16));
    expect(last.resteAfter).toBe(0);
  });

  test("avance versée : champs avance/reste par feuille + notification du reste", () => {
    const pb = {
      dailyAmount: 500,
      startsOn: new Date("2026-10-01T10:00:00Z"),
      createdAt: new Date("2026-10-17T10:00:00Z"),
    };
    // Le client paie 23 000 le 17 oct. : fin novembre couverte d'avance.
    const livret = buildLivret(pb, 23000, OCT(17));
    const [f1, f2] = livret.sheets;
    expect(f1.encaisse).toBe(7500);
    expect(f1.complete).toBe(true);
    expect(f1.reste).toBe(0);
    expect(f1.avance).toBe(7500 - 500 * 1); // 1 seule ligne échue à ce jour
    expect(f2.encaisse).toBe(15500);
    expect(f2.avance).toBe(15500); // feuille future : tout est de l'avance
    expect(f2.reste).toBe(0);
    expect(livret.recap.avanceTotale).toBe(23000 - 500); // au-delà de la ligne du jour
    expect(livret.recap.reste).toBe(500 * (372 - 16) - 23000);
    expect(livret.coveredThrough).toEqual({ sheet: 2, label: "novembre 2026" });
    // L'option « fin novembre » a disparu (déjà couverte) ; la suivante démarre à déc.
    expect(livret.advanceOptions.find((o) => o.sheet === 2)).toBeUndefined();
    const dec = livret.advanceOptions.find((o) => o.sheet === 3);
    expect(dec!.amount).toBe(500 * 31); // décembre seul
    expect(livret.missedLines).toBe(0);
  });

  test("retard au fil des jours puis rattrapage", () => {
    const pb = {
      dailyAmount: 500,
      startsOn: new Date("2026-10-01T10:00:00Z"),
      createdAt: new Date("2026-10-17T10:00:00Z"),
    };
    // Le 20 octobre, 4 lignes échues (17..20), rien versé.
    const l1 = buildLivret(pb, 0, OCT(20));
    expect(l1.missedLines).toBe(4);
    // Rattrapage de 2 mises : 2 lignes couvertes.
    const l2 = buildLivret(pb, 1000, OCT(20));
    expect(l2.coveredLines).toBe(2);
    expect(l2.missedLines).toBe(2);
    expect(l2.sheets[0].avance).toBe(0); // pas d'avance : encore en retard
  });
});
