// TontiHelm — tests avance PARTIELLE + temps réel web ↔ mobile (2026-10-18).
// Décisions du dirigeant :
//   1. l'avance n'est PAS obligatoirement le total du mois : le cotisant peut
//      verser une partie — l'agent renseigne le montant, le système calcule ;
//   2. tout ce qui est fait côté web doit être vu en temps réel sur l'app
//      mobile, et vice versa — flux SSE /api/events (web) et /v1/events
//      (mobile), émis par le moteur d'encaissement commun aux deux canaux.
// Exécution : cd backend && DATABASE_URL="file:dev.db" bun test tests/v1-advance.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "../src/lib/db";
import { startApp, seed, cleanup, mobileLogin, uuidv7, type SeedResult, type MobileSession } from "./helpers/v1";
import { advancePreview, buildLivret, serializeLivret } from "../src/lib/livret";
import type { Server } from "http";

let server: Server;
let url: string;
let data: SeedResult;
let session: MobileSession;

/** Client SSE de test : UN seul lecteur par réponse, plusieurs attentes. */
class SseStream {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder = new TextDecoder();
  private buffer = "";

  constructor(res: Response) {
    this.reader = (res.body as ReadableStream<Uint8Array>).getReader();
  }

  /** Attend le premier bloc SSE satisfaisant le prédicat (le cœur serveur
   *  arrive toutes les 25 s : les lectures ne bloquent jamais plus longtemps). */
  async waitFor(predicate: (block: string) => boolean, timeoutMs = 8000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const blocks = this.buffer.split("\n\n");
      this.buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        if (predicate(block)) return block;
      }
      if (Date.now() > deadline) throw new Error("événement SSE attendu non reçu");
      const { done, value } = await this.reader.read();
      if (done) throw new Error("flux SSE fermé prématurément");
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }

  close(): void {
    this.reader.cancel().catch(() => undefined);
  }
}

async function mobilePush(events: object[]) {
  const res = await fetch(`${url}/v1/sync/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.tokens.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ events, clientTime: new Date().toISOString() }),
  });
  return { status: res.status, body: (await res.json()) as { acks?: { id: string; status: string; collectionId?: string }[]; error?: { code: string } } };
}

beforeAll(async () => {
  ({ server, url } = await startApp());
  data = await seed("V1 Avance Partielle", "30303");
  session = (await mobileLogin(url, data.agent.phone, data.agent.pin, "Samsung A15 avance")).session;
});

afterAll(async () => {
  await cleanup(data);
  server.close();
  await db.$disconnect?.();
});

describe("/v1/sync/push — avance PARTIELLE (décision du dirigeant)", () => {
  test("montant libre inférieur au total du mois : accepté, livret et audit exacts", async () => {
    // Le cotisant veut verser 5 000 (10 lignes) au lieu des 15 500 du mois.
    const { status, body } = await mobilePush([
      {
        id: uuidv7(),
        passbookId: data.passbook.id,
        amount: 5000,
        method: "cash",
        advance: true,
        collectedAt: new Date().toISOString(),
      },
    ]);
    expect(status).toBe(200);
    expect(body.acks![0].status).toBe("accepted");

    const col = await db.collection.findUnique({ where: { id: body.acks![0].collectionId! } });
    expect(col!.amount).toBe(5000);
    expect(col!.dayIndex).toBe(10); // 10 lignes couvertes → dernière ligne = 10
    const audit = await db.auditLog.findFirst({ where: { tenantId: data.tenantId, entityId: col!.id } });
    const payload = JSON.parse(audit!.payload) as { advance: boolean; source: string; amount: number };
    expect(payload.advance).toBe(true);
    expect(payload.source).toBe("sync_v1");
    expect(payload.amount).toBe(5000);
  });

  test("le pull reflète l'avance partielle : solde, lignes, presets recalculés", async () => {
    const res = await fetch(`${url}/v1/sync/pull`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    const body = (await res.json()) as {
      passbooks: {
        passbookId: string;
        balance: number;
        livret: {
          coveredLines: number;
          lineDue: number;
          advanceOptions: { sheet: number; amount: number }[];
          recap: { attendu: number; encaisse: number; avanceTotale: number };
        };
      }[];
    };
    const pb = body.passbooks.find((p) => p.passbookId === data.passbook.id)!;
    expect(pb.balance).toBe(5000);
    expect(pb.livret.coveredLines).toBe(10);
    expect(pb.livret.lineDue).toBe(11);
    expect(pb.livret.recap.encaisse).toBe(5000);
    // Le preset « fin du mois courant » a baissé d'autant : 15 500 − 5 000.
    expect(pb.livret.advanceOptions[0].sheet).toBe(1);
    expect(pb.livret.advanceOptions[0].amount).toBe(10500);
    // Versé au-delà des jours échus (avance réelle, au 18 du mois) : 5000 − 17×500 < 0 ?
    // Non : arrivée le 1er, 17 lignes échues au 18 → l'avance part du rattrapage nul,
    // l'excédent au-delà des 17 lignes échues est de l'avance : 5000 − 8500 < 0 → 0.
    expect(pb.livret.recap.avanceTotale).toBeGreaterThanOrEqual(0);
  });

  test("l'aperçu partagé advancePreview concorde exactement avec l'état du serveur", async () => {
    // Ce que fait l'écran web ET mobile : construire l'entrée depuis la vue
    // sérialisée du pull, puis vérifier la couverture d'une NOUVELLE avance.
    const res = await fetch(`${url}/v1/sync/pull`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    const body = (await res.json()) as { passbooks: { passbookId: string; balance: number; livret: Record<string, unknown> }[] };
    const pb = body.passbooks.find((p) => p.passbookId === data.passbook.id)!;
    const livret = pb.livret as unknown as ReturnType<typeof serializeLivret>;
    // Nouvelle avance partielle de 3 000 par-dessus les 5 000 déjà versés.
    const p = advancePreview(
      {
        dailyAmount: livret.dailyAmount,
        balance: pb.balance,
        coveredLines: livret.coveredLines,
        payableLines: livret.payableLines,
        lineDue: livret.lineDue,
        attendu: livret.recap.attendu,
        sheets: livret.sheets,
      },
      3000
    );
    expect(p.valid).toBe(true);
    expect(p.exceedsReste).toBe(false);
    expect(p.linesCoveredAfter).toBe(16); // 5 000 + 3 000 = 8 000 → 16 lignes
    expect(p.coversThroughLine).toBe(16);
    expect(p.coversFullSheet).toBe(false);
    expect(p.resteAfter).toBe(186000 - 8000);
  });

  test("comportement API inchangé : sans avance, le dépassement reste rejeté (422 de lot web, rejet /v1)", async () => {
    const { status, body } = await mobilePush([
      { id: uuidv7(), passbookId: data.passbook.id, amount: 500 * 500, method: "cash", collectedAt: new Date().toISOString() },
    ]);
    expect(status).toBe(200); // accusé par événement : jamais d'échec de lot sur /v1
    expect(body.acks![0].status).toBe("rejected");
  });
});

describe("temps réel web ↔ mobile — flux SSE", () => {
  test("/v1/events sans jeton : 401 JSON", async () => {
    const res = await fetch(`${url}/v1/events`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  test("canal MOBILE : une écriture poussée par l'app arrive instantanément sur le flux", async () => {
    const res = await fetch(`${url}/v1/events`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const stream = new SseStream(res);

    const hello = await stream.waitFor((b) => b.includes("event: hello"));
    expect(hello).toContain(`"tenantId":"${data.tenantId}"`);

    // Avance partielle supplémentaire poussée par le mobile.
    const { body } = await mobilePush([
      {
        id: uuidv7(),
        passbookId: data.passbook.id,
        amount: 3000,
        method: "cash",
        advance: true,
        collectedAt: new Date().toISOString(),
      },
    ]);
    expect(body.acks![0].status).toBe("accepted");

    // L'événement change arrive sur le flux SANS reconnexion.
    const change = await stream.waitFor((b) => b.includes("event: change"));
    expect(change).toContain('"type":"collection"');
    expect(change).toContain('"amount":3000');
    expect(change).toContain('"source":"sync_v1"');
    expect(change).toContain(`"passbookId":"${data.passbook.id}"`);
    stream.close();
  });

  test("canal WEB : jeton de session accepté en ?token= (EventSource) ; une écriture web est publiée aussi", async () => {
    // Connexion web classique (scrypt 30 j).
    const login = await fetch(`${url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: data.agent.phone, pin: data.agent.pin }),
    });
    const { token } = (await login.json()) as { token: string };
    expect(token).toBeTruthy();

    // EventSource ne peut pas poser d'en-tête : le jeton passe en ?token=.
    const res = await fetch(`${url}/api/events?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const stream = new SseStream(res);
    await stream.waitFor((b) => b.includes("event: hello"));

    // Écriture du canal WEB (/api/agent/sync) : publiée au même flux.
    const push = await fetch(`${url}/api/agent/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            id: uuidv7(),
            passbookId: data.passbook.id,
            amount: 500,
            method: "cash",
            collectedAt: new Date().toISOString(),
          },
        ],
      }),
    });
    expect(push.status).toBe(200);

    const change = await stream.waitFor((b) => b.includes("event: change"));
    expect(change).toContain('"type":"collection"');
    expect(change).toContain('"amount":500');
    expect(change).toContain('"source":"sync"'); // canal web
    stream.close();
  });

  test("les deux canaux partagent le MÊME flux : un abonné web voit l'écriture mobile", async () => {
    // Abonné web…
    const login = await fetch(`${url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: data.agent.phone, pin: data.agent.pin }),
    });
    const { token } = (await login.json()) as { token: string };
    const webRes = await fetch(`${url}/api/events?token=${encodeURIComponent(token)}`);
    const webStream = new SseStream(webRes);
    await webStream.waitFor((b) => b.includes("event: hello"));

    // …qui reçoit l'écriture faite par le MOBILE : le « vice versa ».
    const { body } = await mobilePush([
      {
        id: uuidv7(),
        passbookId: data.passbook.id,
        amount: 1000,
        method: "cash",
        advance: true,
        collectedAt: new Date().toISOString(),
      },
    ]);
    expect(body.acks![0].status).toBe("accepted");
    const change = await webStream.waitFor((b) => b.includes("event: change"));
    expect(change).toContain('"amount":1000');
    expect(change).toContain('"source":"sync_v1"'); // écrit d'un téléphone
    webStream.close();
  });
});
