// TontiHelm — tests /v1/sync/pull (phase 1, §8.3/§8.5/§8.6) :
//  1. premier appel : snapshot COMPLET (portefeuille, carnets avec livret,
//     historique des écritures, clôture du jour, appareil, structure) ;
//  2. appel avec curseur : delta incrémental — seules les écritures reçues
//     depuis le curseur reviennent ;
//  3. avance du curseur : un second delta ne renvoie plus rien ;
//  4. curseur invalide : 400 invalid_cursor (repérage d'un reset) ;
//  5. décalage d'horloge > 10 min : mesuré et alerté (PlanEvent au gérant) ;
//  6. appareil révoqué : 403 device_revoked → purge locale côté téléphone.
// Exécution : cd backend && DATABASE_URL="file:dev.db" bun test
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "../src/lib/db";
import { startApp, seed, cleanup, mobileLogin, uuidv7, type SeedResult, type MobileSession } from "./helpers/v1";
import type { Server } from "http";

let server: Server;
let url: string;
let data: SeedResult;
let session: MobileSession;

async function pull(query: string, token: string) {
  const res = await fetch(`${url}/v1/sync/pull${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  ({ server, url } = await startApp());
  data = await seed("V1 Pull E2E", "30303");
  session = (await mobileLogin(url, data.agent.phone, data.agent.pin, "Samsung A15 de pull")).session;
});

afterAll(async () => {
  await cleanup(data);
  server.close();
  await db.$disconnect?.();
});

describe("/v1/sync/pull — snapshot complet puis delta", () => {
  test("premier appel sans curseur : mode full, portefeuille + livret + appareil + structure", async () => {
    const { status, body } = await pull("", session.tokens.accessToken);
    expect(status).toBe(200);
    expect(body.mode).toBe("full");
    expect(typeof body.cursor).toBe("string");
    expect((body.structure as { name: string }).name).toBe("V1 Pull E2E");
    expect((body.agent as { phone: string }).phone).toBe(data.agent.phone);
    expect((body.device as { id: string }).id).toBe(session.device.id);
    const contributors = body.contributors as { id: string; fullName: string; neighborhood: string | null }[];
    expect(contributors).toHaveLength(1);
    expect(contributors[0].id).toBe(data.contributor.id);
    const passbooks = body.passbooks as { passbookId: string; dailyAmount: number; balance: number; livret: unknown }[];
    expect(passbooks).toHaveLength(1);
    expect(passbooks[0].passbookId).toBe(data.passbook.id);
    expect(passbooks[0].dailyAmount).toBe(500);
    expect(passbooks[0].balance).toBe(0);
    expect(passbooks[0].livret).toBeTruthy();
    expect(body.collections).toHaveLength(0);
    expect(body.closing).toBeNull();
    expect((body.neighborhoods as string[])[0]).toBe("Quartier V1");
  });

  test("deux écritures poussées puis delta : UNIQUEMENT elles reviennent", async () => {
    const first = await pull("", session.tokens.accessToken);
    const cursor = first.body.cursor as string;

    const pushRes = await fetch(`${url}/v1/sync/push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        events: [
          { id: uuidv7(), passbookId: data.passbook.id, amount: 500, method: "cash", collectedAt: new Date().toISOString() },
          { id: uuidv7(), passbookId: data.passbook.id, amount: 500, method: "cash", collectedAt: new Date().toISOString() },
        ],
      }),
    });
    expect(pushRes.status).toBe(200);

    const delta = await pull(`?cursor=${encodeURIComponent(cursor)}`, session.tokens.accessToken);
    expect(delta.status).toBe(200);
    expect(delta.body.mode).toBe("delta");
    const collections = delta.body.collections as { id: string; amount: number }[];
    expect(collections).toHaveLength(2);
    expect(collections.every((c) => c.amount === 500)).toBe(true);
    // Le carnet est revenu (solde changé) avec son livret recalculé.
    const passbooks = delta.body.passbooks as { passbookId: string; balance: number }[];
    expect(passbooks).toHaveLength(1);
    expect(passbooks[0].balance).toBe(1000);

    // Nouveau curseur : plus rien à tirer.
    const cursor2 = delta.body.cursor as string;
    const delta2 = await pull(`?cursor=${encodeURIComponent(cursor2)}`, session.tokens.accessToken);
    expect(delta2.status).toBe(200);
    expect(delta2.body.collections).toHaveLength(0);
    expect(delta2.body.passbooks).toHaveLength(0);
  });

  test("curseur invalide : 400 invalid_cursor", async () => {
    const { status, body } = await pull("?cursor=pas-une-date", session.tokens.accessToken);
    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("invalid_cursor");
  });

  test("décalage d'horloge > 10 min : mesuré sur l'appareil + alerte au gérant (§8.6)", async () => {
    const late = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { status, body } = await pull(`?clientTime=${encodeURIComponent(late)}`, session.tokens.accessToken);
    expect(status).toBe(200);
    const skew = (body.device as { clockSkewMs: number | null }).clockSkewMs;
    expect(skew).not.toBeNull();
    expect(Math.abs(skew!)).toBeGreaterThan(14 * 60 * 1000);
    const alert = await db.planEvent.findFirst({
      where: { tenantId: data.tenantId, kind: "device_clock_skew" },
    });
    expect(alert).not.toBeNull();
    expect(alert!.message).toContain("retard");
  });

  test("appareil révoqué : la traction suivante est coupée (403 device_revoked)", async () => {
    const revoke = await fetch(`${url}/v1/devices/${session.device.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(revoke.status).toBe(200); // auto-révocation permise
    const { status, body } = await pull("", session.tokens.accessToken);
    expect(status).toBe(403);
    expect((body.error as { code: string }).code).toBe("device_revoked");
  });
});
