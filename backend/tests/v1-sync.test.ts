// TontiHelm — tests /v1/sync/push + non-régression /api/agent/sync (phase 1, §8.2) :
//  1. accusé PAR ÉVÉNEMENT : accepté / doublon / rejeté + motif (plus jamais
//     d'échec HTTP de tout le lot sur /v1) ;
//  2. idempotence UUID : 3 envois répétés du même lot = 3 écritures, pas 9 ;
//  3. ligne du livret séquentielle (dayIndex = firstPayableLine + paidDays − 1) ;
//  4. rejets métier exacts du web (amount_exceeds, day_out_of_cycle) ;
//  5. verrou de clôture PAR ÉVÉNEMENT (écart n° 3 : l'événement d'un autre
//     jour passe, celui du jour verrouillé est rejeté seul) ;
//  6. NON-RÉGRESSION web : /api/agent/sync garde l'échec HTTP de lot (422) ;
//  7. limite de débit (§8.9, plafond test) ;
//  8. décalage d'horloge marqué dans l'accusé et l'audit (§8.6).
// Exécution : cd backend && DATABASE_URL="file:dev.db" bun test
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "../src/lib/db";
import { startApp, seed, cleanup, mobileLogin, uuidv7, type SeedResult, type MobileSession } from "./helpers/v1";
import type { Server } from "http";

let server: Server;
let url: string;
let data: SeedResult;
let session: MobileSession;

type Ack = { id: string; status: string; collectionId?: string; reason?: { code: string; message: string } };

async function push(token: string, events: object[], clientTime?: string) {
  const res = await fetch(`${url}/v1/sync/push`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ events, ...(clientTime ? { clientTime } : {}) }),
  });
  return {
    status: res.status,
    body: (await res.json()) as {
      acks?: Ack[];
      error?: { code: string; message: string };
      device?: { clockSkewMs: number | null };
    },
  };
}

function event(
  amount: number,
  extra: Partial<{ id: string; advance: boolean; coversOn: string; collectedAt: string; method: string }> = {}
) {
  return {
    id: extra.id ?? uuidv7(),
    passbookId: data.passbook.id,
    amount,
    method: extra.method ?? "cash",
    advance: extra.advance ?? false,
    collectedAt: extra.collectedAt ?? new Date().toISOString(),
    ...(extra.coversOn ? { coversOn: extra.coversOn } : {}),
  };
}

beforeAll(async () => {
  ({ server, url } = await startApp());
  data = await seed("V1 Sync E2E", "20202");
  session = (await mobileLogin(url, data.agent.phone, data.agent.pin, "Samsung A15 de sync")).session;
});

afterAll(async () => {
  await cleanup(data);
  server.close();
  await db.$disconnect?.();
});

describe("/v1/sync/push — accusés par événement", () => {
  test("lot mixte : accepté + rejet amount_exceeds + rejet day_out_of_cycle, en UN SEUL 200", async () => {
    const outOfLivret = new Date();
    outOfLivret.setUTCMonth(outOfLivret.getUTCMonth() + 13); // 13 mois plus loin : hors des 12 feuilles

    const { status, body } = await push(session.tokens.accessToken, [
      event(500), // bon
      event(500 * 500), // >> reste du livret sans avance
      event(500, { coversOn: outOfLivret.toISOString().slice(0, 10) }), // hors livret
    ]);
    expect(status).toBe(200); // JAMAIS d'échec de lot sur /v1
    expect(body.acks).toHaveLength(3);
    expect(body.acks![0].status).toBe("accepted");
    expect(body.acks![1].status).toBe("rejected");
    expect(body.acks![1].reason!.code).toBe("amount_exceeds");
    expect(body.acks![1].reason!.message).toContain("montant restant du livret");
    expect(body.acks![2].status).toBe("rejected");
    expect(body.acks![2].reason!.code).toBe("day_out_of_cycle");
    expect(body.acks![2].reason!.message).toContain("hors du livret annuel");
  });

  test("idempotence UUID : 3 envois répétés du même lot → 1er accepté, 2 suivants doublons, 3 écritures en base", async () => {
    const before = await db.collection.count({ where: { tenantId: data.tenantId } });
    const batch = [event(500), event(500), event(1000)];
    const first = await push(session.tokens.accessToken, batch);
    expect(first.status).toBe(200);
    expect(first.body.acks!.every((a) => a.status === "accepted")).toBe(true);
    // Rejoué DEUX fois (réseau instable) : tout est doublon, rien n'est dupliqué.
    const second = await push(session.tokens.accessToken, batch);
    const third = await push(session.tokens.accessToken, batch);
    expect(second.body.acks!.every((a) => a.status === "duplicate")).toBe(true);
    expect(third.body.acks!.every((a) => a.status === "duplicate")).toBe(true);
    const after = await db.collection.count({ where: { tenantId: data.tenantId } });
    expect(after - before).toBe(3);
  });

  test("ligne du livret séquentielle : dayIndex = firstPayableLine + paidDays − 1 (moteur du web)", async () => {
    const rows = await db.collection.findMany({
      where: { passbookId: data.passbook.id },
      orderBy: { receivedAt: "asc" },
    });
    // Arrivée le 1er du mois : 500, puis 500, 500, 1000. Formule du web :
    // dayIndex = firstPayableLine + paidDays(balance + amount) − 1 → l'événement
    // de 1000 couvre les lignes 4 ET 5, son dayIndex est la DERNIÈRE ligne couverte.
    expect(rows.map((r) => r.dayIndex)).toEqual([1, 2, 3, 5]);
  });

  test("lot > 50 refusé avec le message du web", async () => {
    const events = Array.from({ length: 51 }, () => event(500));
    const { status, body } = await push(session.tokens.accessToken, events);
    expect(status).toBe(400);
    expect(body.error!.code).toBe("invalid_input");
    expect(body.error!.message).toBe("Lot trop volumineux (50 maximum).");
  });

  test("décalage d'horloge renvoyé dans l'accusé et marqué dans l'audit (§8.6)", async () => {
    const skewed = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min de retard
    const { status, body } = await push(session.tokens.accessToken, [event(500)], skewed);
    expect(status).toBe(200);
    expect(body.device!.clockSkewMs).not.toBeNull();
    expect(Math.abs(body.device!.clockSkewMs!)).toBeGreaterThan(29 * 60 * 1000);
    const last = await db.collection.findFirst({
      where: { passbookId: data.passbook.id },
      orderBy: { receivedAt: "desc" },
    });
    const audit = await db.auditLog.findFirst({
      where: { tenantId: data.tenantId, entityId: last!.id },
    });
    const payload = JSON.parse(audit!.payload) as { deviceId: string; clockSkewMs: number; source: string };
    expect(payload.source).toBe("sync_v1");
    expect(payload.deviceId).toBe(session.device.id);
    expect(Math.abs(payload.clockSkewMs)).toBeGreaterThan(29 * 60 * 1000);
    // Alerte gérant créée (au plus une par jour et par appareil).
    const alert = await db.planEvent.findFirst({
      where: { tenantId: data.tenantId, kind: "device_clock_skew" },
    });
    expect(alert).not.toBeNull();
    expect(alert!.message).toContain(session.device.id);
  });
});

describe("/v1/sync/push — verrou de clôture PAR ÉVÉNEMENT (écart n° 3)", () => {
  test("clôture validée AUJOURD'HUI : l'événement du jour est rejeté seul, celui d'hier passe", async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    await db.closing.create({
      data: {
        tenantId: data.tenantId,
        agentId: data.agent.id,
        day: todayStart,
        declaredCash: 0,
        expectedCash: 0,
        gap: 0,
        status: "validated",
      },
    });
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const { status, body } = await push(session.tokens.accessToken, [
      event(500), // aujourd'hui → verrouillé
      event(500, { collectedAt: yesterday.toISOString() }), // hier → passe
    ]);
    expect(status).toBe(200);
    expect(body.acks![0].status).toBe("rejected");
    expect(body.acks![0].reason!.code).toBe("day_locked");
    expect(body.acks![0].reason!.message).toContain("verrouillés");
    expect(body.acks![1].status).toBe("accepted");
  });
});

describe("/v1/sync/push — limite de débit (§8.9)", () => {
  test("au-delà du plafond par minute : 429 rate_limited (plafond test 5, appareil vierge)", async () => {
    process.env.SYNC_RATE_LIMIT_PER_MIN = "5";
    try {
      const rateSession = (
        await mobileLogin(url, data.agent.phone, data.agent.pin, "Appareil débit")
      ).session;
      const codes: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        const res = await fetch(`${url}/v1/sync/push`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${rateSession.tokens.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ events: [] }),
        });
        codes.push(res.status);
      }
      expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(codes[5]).toBe(429);
      expect(codes[6]).toBe(429);
      const limited = await push(rateSession.tokens.accessToken, []);
      expect(limited.body.error!.code).toBe("rate_limited");
      expect(limited.body.error!.message).toContain("Patiente une minute");
    } finally {
      delete process.env.SYNC_RATE_LIMIT_PER_MIN;
    }
  });
});

describe("NON-RÉGRESSION web — /api/agent/sync garde son comportement de lot", () => {
  test("session web (scrypt 30 j) intacte ; idempotence web ; rejet métier = HTTP 422 de TOUT le lot", async () => {
    // Retire la clôture validée posée par le test précédent (elle verrouillerait
    // la journée pour le canal web aussi).
    await db.closing.deleteMany({ where: { tenantId: data.tenantId } });

    const login = await fetch(`${url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: data.agent.phone, pin: data.agent.pin }),
    });
    const { token } = (await login.json()) as { token: string };
    expect(token).toBeTruthy();

    const webPush = async (events: object[]) => {
      const res = await fetch(`${url}/api/agent/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
      });
      return {
        status: res.status,
        body: (await res.json()) as { acks?: { status: string }[]; error?: { code: string } },
      };
    };

    // Idempotence inchangée (created puis duplicate — libellés WEB conservés).
    const ev = event(500);
    const first = await webPush([ev]);
    expect(first.status).toBe(200);
    expect(first.body.acks![0].status).toBe("created");
    const second = await webPush([ev]);
    expect(second.body.acks![0].status).toBe("duplicate");

    // Rejet métier : ÉCHEC HTTP de lot — comportement web d'origine intact
    // (c'est précisément ce que /v1 remplace par l'accusé par événement).
    const bad = await webPush([event(500), event(500 * 500)]);
    expect(bad.status).toBe(422);
    expect(bad.body.error!.code).toBe("amount_exceeds");
  });
});
