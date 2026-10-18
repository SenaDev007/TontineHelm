// TontiHelm — tests /v1/closing (phase 2) : la déclaration de caisse mobile
// est le MIROIR des règles web de `POST /api/agent/closing` (M5) sur le canal
// appareil+jetons /v1. Vérifié ici :
//  1. jour sans encaissement : écart nul, message « Aucun écart » ;
//  2. espèces attendues = encaissements EN ESPÈCES du jour poussés par
//     /v1/sync/push (le mobile money ne compte pas) et écart = déclaré − attendu ;
//  3. redéclaration le même jour → 409 already_declared (verrou du web) ;
//  4. montant invalide (négatif) → 400 avec le message du web ;
//  5. audit chaîné closing_declared avec la source closing_v1 (§8.6) ;
//  6. jeton absent → 401 (garde du canal mobile).
// Exécution : cd backend && DATABASE_URL="file:dev.db" bun test
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "../src/lib/db";
import { startApp, seed, cleanup, mobileLogin, uuidv7, type SeedResult, type MobileSession } from "./helpers/v1";
import type { Server } from "http";

let server: Server;
let url: string;
let data: SeedResult;
let session: MobileSession;

async function declare(token: string | null, declaredCash: number) {
  const res = await fetch(`${url}/v1/closing`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ declaredCash }),
  });
  return {
    status: res.status,
    body: (await res.json()) as {
      closing?: { id: string; declaredCash: number; expectedCash: number; gap: number; status: string };
      message?: string;
      error?: { code: string; message: string };
    },
  };
}

beforeAll(async () => {
  ({ server, url } = await startApp());
  data = await seed("V1 Closing E2E", "30303");
  session = (await mobileLogin(url, data.agent.phone, data.agent.pin, "Samsung A15 closing")).session;
});

afterAll(async () => {
  await cleanup(data);
  server.close();
  await db.$disconnect?.();
});

describe("/v1/closing — miroir mobile de POST /api/agent/closing", () => {
  test("jour sans encaissement : écart nul et message sans écart", async () => {
    const { status, body } = await declare(session.tokens.accessToken, 0);
    expect(status).toBe(200);
    expect(body.closing!.status).toBe("declared");
    expect(body.closing!.expectedCash).toBe(0);
    expect(body.closing!.gap).toBe(0);
    expect(body.message).toContain("Aucun écart");
  });

  test("déjà déclarée le même jour → 409 already_declared (verrou du web conservé)", async () => {
    const { status, body } = await declare(session.tokens.accessToken, 500);
    expect(status).toBe(409);
    expect(body.error!.code).toBe("already_declared");
    expect(body.error!.message).toContain("déjà déclarée");
  });

  test("montant négatif → 400 avec le message du web", async () => {
    const { status, body } = await declare(session.tokens.accessToken, -5);
    expect(status).toBe(400);
    expect(body.error!.code).toBe("invalid_input");
    expect(body.error!.message).toBe("Montant invalide.");
  });

  test("sans jeton → 401 (garde du canal mobile, pas de session web)", async () => {
    const { status, body } = await declare(null, 0);
    expect(status).toBe(401);
    expect(body.error!.code).toBe("unauthorized");
  });

  test("audit chaîné closing_declared, source closing_v1", async () => {
    const row = await db.auditLog.findFirst({
      where: { tenantId: data.tenantId, action: "closing_declared" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).not.toBeNull();
    expect((row!.payload as Record<string, unknown>).source).toBe("closing_v1");
    expect((row!.payload as Record<string, unknown>).deviceId).toBe(session.device.id);
  });

  test("espèces attendues et écart : espèces poussées comptent, mobile money non (règle M5)", async () => {
    // Nouvelle structure neuve pour un jour propre : deux espèces + un mobile money.
    const fresh = await seed("V1 Closing Cash", "30404");
    const freshSession = (await mobileLogin(url, fresh.agent.phone, fresh.agent.pin, "Tecno closing")).session;
    const events = [500, 700, 1000].map((amount, i) => ({
      id: uuidv7(),
      passbookId: fresh.passbook.id,
      amount,
      method: i === 2 ? "mobile_money" : "cash",
      advance: false,
      collectedAt: new Date().toISOString(),
    }));
    const pushRes = await fetch(`${url}/v1/sync/push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${freshSession.tokens.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
    const pushBody = (await pushRes.json()) as { acks?: { status: string }[] };
    expect(pushRes.status).toBe(200);
    expect(pushBody.acks!.every((a) => a.status === "accepted")).toBe(true);

    // Attendu = 500 + 700 (le mobile money de 1000 ne compte pas en caisse).
    const { status, body } = await declare(freshSession.tokens.accessToken, 1000);
    expect(status).toBe(200);
    expect(body.closing!.expectedCash).toBe(1200);
    expect(body.closing!.gap).toBe(-200); // déclaré − attendu
    expect(body.message).toContain("200");
    expect(body.message).toContain("Vérifie la tournée");

    await cleanup(fresh);
  });
});
