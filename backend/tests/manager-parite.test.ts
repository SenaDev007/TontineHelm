// TontiHelm — tests d'intégration des ajouts web « PARITE.md §8.12-§8.15 » :
//   §8.13 réassignation d'agent en cours de cycle (décision n° 4) ;
//   §8.15 export du journal d'audit PDF/Excel (décision n° 10) ;
//   §8.12 bascule past_due → read_only après 15 jours d'impayé (décision n° 6) ;
//   §8.14 cycles courts paramétrables, bornes 1..372 (décision n° 5).
// Exécution : cd backend && DATABASE_URL="…" bun test tests/manager-parite.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "http";
import authRoutes from "../src/routes/auth";
import agentRoutes from "../src/routes/agent";
import managerRoutes from "../src/routes/manager";
import exportRoutes from "../src/routes/export";
import structuresRoutes from "../src/routes/structures";
import { apiErrorHandler, hashPin } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { monthStart, LIVRET_DAYS } from "../src/lib/livret";
import { seed, cleanup, uuidv7, type SeedResult } from "./helpers/v1";

let server: Server;
let url: string;
let data: SeedResult;
let ownerToken: string;
let secondAgentId: string;
let secondAgentPhone: string;

async function loginWeb(phone: string, pin: string): Promise<string> {
  const res = await fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, pin }),
  });
  const body = (await res.json()) as { token?: string };
  if (res.status !== 200 || !body.token) throw new Error(`login web inattendu ${res.status}`);
  return body.token;
}

async function api(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const res = await fetch(`${url}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  let parsed: Record<string, unknown> = {};
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) {
    try {
      parsed = (await res.json()) as Record<string, unknown>;
    } catch {
      /* corps vide */
    }
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/auth", authRoutes);
  app.use("/api/agent", agentRoutes);
  app.use("/api/manager/export", exportRoutes);
  app.use("/api/manager", managerRoutes);
  app.use("/api/structures", structuresRoutes);
  app.use(apiErrorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const addr = server.address() as { port: number };
  url = `http://127.0.0.1:${addr.port}`;

  data = await seed("Parité Web §8.12-15", String(Date.now()).slice(-6));
  ownerToken = await loginWeb(data.owner.phone, data.owner.pin);

  // Deuxième agent de la MÊME structure pour la réassignation.
  secondAgentPhone = `+22996${String(Date.now()).slice(-6)}03`;
  const second = await db.user.create({
    data: {
      tenantId: data.tenantId,
      phone: secondAgentPhone,
      fullName: "Agent Deux",
      role: "agent",
      pinHash: hashPin("135790"),
    },
  });
  secondAgentId = second.id;
});

afterAll(async () => {
  await cleanup(data);
  server.close();
});

/* ── §8.13 Réassignation d'agent en cours de cycle ─────────────────────────── */

describe("§8.13 — réassignation d'agent", () => {
  test("un encaissement d'abord : il restera à l'agent d'origine", async () => {
    // L'agent 1 encaisse une mise sur le carnet semé par seed().
    const agentToken = await loginWeb(data.agent.phone, data.agent.pin);
    const res = await api("/api/agent/sync", {
      method: "POST",
      token: agentToken,
      body: {
        events: [
          {
            id: uuidv7(),
            passbookId: data.passbook.id,
            amount: 500,
            method: "cash",
            collectedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect((res.body.acks as { status?: string }[])[0]?.status).toBe("created");
  });

  test("réassignation : carnets actifs suivent, écritures passées conservent leur agent", async () => {
    const res = await api(`/api/manager/contributors/${data.contributor.id}/reassign`, {
      method: "POST",
      token: ownerToken,
      body: { agentId: secondAgentId },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.passbooksMoved).toBe(1);

    const [pb, contributor, collections] = await Promise.all([
      db.passbook.findUnique({ where: { id: data.passbook.id } }),
      db.contributor.findUnique({ where: { id: data.contributor.id } }),
      db.collection.findMany({ where: { passbookId: data.passbook.id } }),
    ]);
    expect(pb?.agentId).toBe(secondAgentId);
    expect(contributor?.agentId).toBe(secondAgentId);
    // L'encaissement PASSÉ reste à l'agent qui l'a fait (règle §8.13).
    expect(collections).toHaveLength(1);
    expect(collections[0].agentId).toBe(data.agent.id);

    // Écriture d'audit dédiée, chaîne scellée.
    const audit = await db.auditLog.findFirst({
      where: { tenantId: data.tenantId, action: "agent_reassigned" },
      orderBy: { seq: "desc" },
    });
    expect(audit).not.toBeNull();
    const payload = JSON.parse(audit?.payload ?? "{}") as Record<string, unknown>;
    expect(payload.passbooksMoved).toBe(1);
    expect(payload.toAgent).toBe("Agent Deux");
  });

  test("rejet : réassigner au même agent", async () => {
    const res = await api(`/api/manager/contributors/${data.contributor.id}/reassign`, {
      method: "POST",
      token: ownerToken,
      body: { agentId: secondAgentId },
    });
    expect(res.status).toBe(400);
    expect((res.body.error as { code?: string })?.code).toBe("same_agent");
  });

  test("rejet : agent d'une AUTRE structure (isolation multi-tenant)", async () => {
    // Une seconde structure avec son propre agent.
    const other = await db.structure.create({ data: { name: "Autre structure", kind: "sfd", status: "active" } });
    const otherAgent = await db.user.create({
      data: {
        tenantId: other.id,
        phone: `+22995${String(Date.now()).slice(-6)}04`,
        fullName: "Agent Étranger",
        role: "agent",
        pinHash: hashPin("135790"),
      },
    });
    const res = await api(`/api/manager/contributors/${data.contributor.id}/reassign`, {
      method: "POST",
      token: ownerToken,
      body: { agentId: otherAgent.id },
    });
    expect(res.status).toBe(404);
    // Nettoyage de la structure étrangère.
    await db.user.delete({ where: { id: otherAgent.id } });
    await db.structure.delete({ where: { id: other.id } });
  });

  test("rejet : un agent (pas un gérant) ne peut pas réassigner", async () => {
    const agentToken = await loginWeb(data.agent.phone, data.agent.pin);
    const res = await api(`/api/manager/contributors/${data.contributor.id}/reassign`, {
      method: "POST",
      token: agentToken,
      body: { agentId: data.agent.id },
    });
    expect(res.status).toBe(403);
  });
});

/* ── §8.15 Export du journal d'audit ───────────────────────────────────────── */

describe("§8.15 — export du journal d'audit", () => {
  test("PDF : 200, bon type, en-tête de téléchargement, journalisé", async () => {
    const res = await api("/api/manager/export/audit?format=pdf", { token: ownerToken });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition") ?? "").toContain("journal-audit-");
    // La sortie du journal fait partie du journal (report_exported).
    const audit = await db.auditLog.findFirst({
      where: { tenantId: data.tenantId, action: "report_exported", entity: "audit" },
      orderBy: { seq: "desc" },
    });
    expect(audit).not.toBeNull();
    const payload = JSON.parse(audit?.payload ?? "{}") as Record<string, unknown>;
    expect(payload.format).toBe("pdf");
  });

  test("Excel : 200, bon type de feuille de calcul", async () => {
    const res = await api("/api/manager/export/audit?format=xlsx", { token: ownerToken });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  test("filtre d'action : ne sort que les lignes du type demandé (comptage)", async () => {
    // On passe par la route de listing pour compter avant/après : le filtre
    // d'export est le même prédicat (action exacte).
    const all = await api("/api/manager/audit?page=1", { token: ownerToken });
    const total = all.body.total as number;
    expect(total).toBeGreaterThan(0);
    // L'export filtré sur une action inexistante renvoie un fichier avec 0 ligne
    // (période par défaut complète) — vérifié par le code HTTP 200 et l'audit.
    const res = await api("/api/manager/export/audit?format=pdf&action=agent_reassigned", { token: ownerToken });
    expect(res.status).toBe(200);
    const audit = await db.auditLog.findFirst({
      where: { tenantId: data.tenantId, action: "report_exported", entity: "audit" },
      orderBy: { seq: "desc" },
    });
    const payload = JSON.parse(audit?.payload ?? "{}") as Record<string, unknown>;
    expect(payload.action).toBe("agent_reassigned");
    expect(payload.rows).toBe(1);
  });

  test("rejet : période inversée", async () => {
    const res = await api(
      "/api/manager/export/audit?format=pdf&from=2026-10-18&to=2026-01-01",
      { token: ownerToken }
    );
    expect(res.status).toBe(400);
    expect((res.body.error as { code?: string })?.code).toBe("invalid_period");
  });
});

/* ── §8.12 Bascule past_due → read_only (15 jours d'impayé) ────────────────── */

describe("§8.12 — bascule read_only après 15 jours d'impayé", () => {
  test("impayé de 16 jours : l'écriture est refusée ET la bascule est journalisée une seule fois", async () => {
    const sub = await db.subscription.findUnique({ where: { tenantId: data.tenantId } });
    expect(sub).not.toBeNull();
    await db.subscription.update({
      where: { tenantId: data.tenantId },
      data: { periodEnd: new Date(Date.now() - 16 * 24 * 3600 * 1000) },
    });

    // Une écritriture quelconque (sync agent) déclenche assertWritable → bascule
    // PUIS refus read_only dans la MÊME requête.
    const agentToken = await loginWeb(data.agent.phone, data.agent.pin);
    const res = await api("/api/agent/sync", {
      method: "POST",
      token: agentToken,
      body: {
        events: [
          {
            id: uuidv7(),
            passbookId: data.passbook.id,
            amount: 500,
            method: "cash",
            collectedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res.status).toBe(403);
    expect((res.body.error as { code?: string })?.code).toBe("read_only");

    // Journalisée AU PLUS UNE FOIS.
    const flips = await db.auditLog.findMany({
      where: { tenantId: data.tenantId, action: "subscription_read_only" },
    });
    expect(flips.length).toBe(1);

    // Une deuxième écritriture : refusée pareil, sans nouvelle entrée d'audit.
    const res2 = await api("/api/agent/sync", {
      method: "POST",
      token: agentToken,
      body: {
        events: [
          {
            id: uuidv7(),
            passbookId: data.passbook.id,
            amount: 500,
            method: "cash",
            collectedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res2.status).toBe(403);
    const flips2 = await db.auditLog.findMany({
      where: { tenantId: data.tenantId, action: "subscription_read_only" },
    });
    expect(flips2.length).toBe(1);
  });

  test("passe quotidienne (register/cleanup) : détecte et renvoie les bascules", async () => {
    // Une deuxième structure en impayé de 20 jours, jamais visitée.
    const other = await db.structure.create({ data: { name: "Impayée", kind: "sfd", status: "active" } });
    await db.subscription.create({
      data: {
        tenantId: other.id,
        plan: "demarrage",
        status: "active",
        periodStart: new Date(Date.now() - 50 * 24 * 3600 * 1000),
        periodEnd: new Date(Date.now() - 20 * 24 * 3600 * 1000),
      },
    });
    const res = await api("/api/structures/register/cleanup", { method: "POST" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.readOnlyFlipped).toBe(1); // la structure de test est DÉJÀ read_only
    const flipped = await db.subscription.findUnique({ where: { tenantId: other.id } });
    expect(flipped?.status).toBe("read_only");
    // Nettoyage.
    await db.auditLog.deleteMany({ where: { tenantId: other.id } });
    await db.subscription.delete({ where: { tenantId: other.id } });
    await db.structure.delete({ where: { id: other.id } });
  });

  test("sortie de read_only : le règlement rétablit l'écriture (période repoussée)", async () => {
    // Le règlement du renouvellement repousse la fin de période et repasse actif
    // (c'est le chemin qu'empruntera le paiement de renouvellement).
    await db.subscription.update({
      where: { tenantId: data.tenantId },
      data: { status: "active", periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
    });
    const agentToken = await loginWeb(data.agent.phone, data.agent.pin);
    const res = await api("/api/agent/sync", {
      method: "POST",
      token: agentToken,
      body: {
        events: [
          {
            id: uuidv7(),
            passbookId: data.passbook.id,
            amount: 500,
            method: "cash",
            collectedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res.status).toBe(200);
  });
});

/* ── §8.14 Cycles courts paramétrables ─────────────────────────────────────── */

describe("§8.14 — cycles courts paramétrables", () => {
  let shortCyclePbId = "";

  test("création avec cycleDays=45 : 2 feuilles, tournée et audit cohérents", async () => {
    const res = await api("/api/manager/passbooks", {
      method: "POST",
      token: ownerToken,
      body: { contributorId: data.contributor.id, dailyAmount: 500, cycleDays: 45 },
    });
    expect(res.status).toBe(200);
    const pbId = (res.body.passbook as { id: string }).id;
    shortCyclePbId = pbId;

    const pb = await db.passbook.findUnique({ where: { id: pbId } });
    expect(pb?.cycleDays).toBe(45);

    // L'audit porte la durée et le nombre de feuilles.
    const audit = await db.auditLog.findFirst({
      where: { tenantId: data.tenantId, action: "passbook_created", entityId: pbId },
    });
    const payload = JSON.parse(audit?.payload ?? "{}") as Record<string, unknown>;
    expect(payload.cycleDays).toBe(45);
    expect(payload.months).toBe(2);

    // La tournée de l'agent (l'agent 2 tient maintenant le carnet réassigné ;
    // le nouveau carnet suit le contributor → agent 2) expose months=2.
    const agent2Token = await loginWeb(secondAgentPhone, "135790");
    const tour = await api("/api/agent/tour", { token: agent2Token });
    expect(tour.status).toBe(200);
    const stops = tour.body.stops as { passbookId: string; livret: { months: number; cycleDays: number; payableLines: number; excusedLines: number } }[];
    const stop = stops.find((s) => s.passbookId === pbId);
    expect(stop?.livret.months).toBe(2);
    expect(stop?.livret.cycleDays).toBe(45);
    // Règle d'équité : arrivée au jour de création → lignes d'avant excusées,
    // attendu proratisé (borne « mois d'arrivée proratisé » exigée par §8.14).
    const arrivalDay = Math.min(new Date().getUTCDate(), 31);
    expect(stop?.livret.excusedLines).toBe(arrivalDay - 1);
    expect(stop?.livret.payableLines).toBe(45 - (arrivalDay - 1));
  });

  test("création SANS durée : 372 par défaut (livret annuel inchangé)", async () => {
    const res = await api("/api/manager/passbooks", {
      method: "POST",
      token: ownerToken,
      body: { contributorId: data.contributor.id, dailyAmount: 300 },
    });
    expect(res.status).toBe(200);
    const pbId = (res.body.passbook as { id: string }).id;
    const pb = await db.passbook.findUnique({ where: { id: pbId } });
    expect(pb?.cycleDays).toBe(LIVRET_DAYS);
    expect(pb?.startsOn.toISOString().slice(0, 10)).toBe(monthStart(new Date()).toISOString().slice(0, 10));
  });

  test("bornes : durée 0 et 400 rejetées avec message français", async () => {
    const zero = await api("/api/manager/passbooks", {
      method: "POST",
      token: ownerToken,
      body: { contributorId: data.contributor.id, dailyAmount: 500, cycleDays: 0 },
    });
    expect(zero.status).toBe(400);
    const big = await api("/api/manager/passbooks", {
      method: "POST",
      token: ownerToken,
      body: { contributorId: data.contributor.id, dailyAmount: 500, cycleDays: 400 },
    });
    expect(big.status).toBe(400);
    expect((big.body.error as { message?: string })?.message).toContain("372");
  });

  test("encaissement borné par le cycle court : au-delà de l'attendu → avance exigée", async () => {
    // Agent 2 (réassigné) encaisse au-delà du reste SANS avance : rejet amount_exceeds.
    // L'attendu du carnet de 45 jours est proratisé à l'arrivée : 45 mises le dépassent forcément.
    const agent2Token = await loginWeb(secondAgentPhone, "135790");
    const res = await api("/api/agent/sync", {
      method: "POST",
      token: agent2Token,
      body: {
        events: [
          {
            id: uuidv7(),
            passbookId: shortCyclePbId,
            amount: 45 * 500,
            method: "cash",
            collectedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(res.status).toBe(422);
    expect((res.body.error as { code?: string })?.code).toBe("amount_exceeds");
  });
});
