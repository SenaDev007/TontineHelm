// TontiHelm — outillage des tests /v1 (phase 1) : application Express montée sur
// un port éphémère (routeurs v1 + web pour les non-régressions), amorçage de
// données de test et flux de connexion mobile complet (login + OTP dev).
import express from "express";
import type { Server } from "http";
import authRoutes from "../../src/routes/auth";
import agentRoutes from "../../src/routes/agent";
import v1AuthRoutes from "../../src/routes/v1/auth";
import v1DeviceRoutes from "../../src/routes/v1/devices";
import v1SyncRoutes from "../../src/routes/v1/sync";
import { apiErrorHandler, hashPin } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { monthStart, LIVRET_DAYS } from "../../src/lib/livret";

export function buildApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/auth", authRoutes);
  app.use("/api/agent", agentRoutes);
  app.use("/v1/auth", v1AuthRoutes);
  app.use("/v1/devices", v1DeviceRoutes);
  app.use("/v1/sync", v1SyncRoutes);
  app.use(apiErrorHandler);
  return app;
}

export async function startApp(): Promise<{ server: Server; url: string }> {
  const server = buildApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const addr = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${addr.port}` };
}

/** UUID v7 minimal (horodatage ms + aléa) pour les événements des tests. */
export function uuidv7(): string {
  const ts = Date.now().toString(16).padStart(12, "0");
  const rnd = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${ts.slice(0, 8)}-${ts.slice(8)}-7${rnd(3)}-8${rnd(3)}-${rnd(12)}`;
}

export interface SeedResult {
  tenantId: string;
  owner: { id: string; phone: string; pin: string };
  agent: { id: string; phone: string; pin: string };
  contributor: { id: string };
  passbook: { id: string; number: string };
}

export async function seed(name: string, suffix: string): Promise<SeedResult> {
  const structure = await db.structure.create({
    data: { name, kind: "sfd", city: "Cotonou", status: "active", slug: `v1-${suffix}` },
  });
  await db.subscription.create({
    data: {
      tenantId: structure.id,
      plan: "pro",
      status: "active",
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });
  const owner = await db.user.create({
    data: {
      tenantId: structure.id,
      phone: `+22997${suffix.padStart(5, "0").slice(-5)}01`,
      fullName: `Dirigeante ${suffix}`,
      role: "owner",
      pinHash: hashPin("246810"),
    },
  });
  const agent = await db.user.create({
    data: {
      tenantId: structure.id,
      phone: `+22997${suffix.padStart(5, "0").slice(-5)}02`,
      fullName: `Agent ${suffix}`,
      role: "agent",
      pinHash: hashPin("135790"),
    },
  });
  const contributor = await db.contributor.create({
    data: {
      tenantId: structure.id,
      fullName: `Cliente ${suffix}`,
      phone: "+22996000099",
      neighborhood: "Quartier V1",
      agentId: agent.id,
    },
  });
  const startsOn = monthStart(new Date());
  const passbook = await db.passbook.create({
    data: {
      tenantId: structure.id,
      contributorId: contributor.id,
      agentId: agent.id,
      number: `9${suffix}`,
      dailyAmount: 500,
      cycleDays: LIVRET_DAYS,
      startsOn,
      // Arrivée le 1er du mois : aucune ligne excusée, math identique au web.
      createdAt: startsOn,
    },
  });
  return {
    tenantId: structure.id,
    owner: { id: owner.id, phone: owner.phone, pin: "246810" },
    agent: { id: agent.id, phone: agent.phone, pin: "135790" },
    contributor: { id: contributor.id },
    passbook: { id: passbook.id, number: passbook.number },
  };
}

export async function cleanup(seedResult: SeedResult): Promise<void> {
  const tenantId = seedResult.tenantId;
  const phones = [seedResult.owner.phone, seedResult.agent.phone];
  await db.collection.deleteMany({ where: { tenantId } });
  await db.closing.deleteMany({ where: { tenantId } });
  await db.payment.deleteMany({ where: { tenantId } });
  await db.notification.deleteMany({ where: { tenantId } });
  await db.auditLog.deleteMany({ where: { tenantId } });
  await db.planEvent.deleteMany({ where: { tenantId } });
  await db.invoice.deleteMany({ where: { tenantId } });
  await db.passbook.deleteMany({ where: { tenantId } });
  await db.contributor.deleteMany({ where: { tenantId } });
  await db.mobileToken.deleteMany({ where: { device: { user: { tenantId } } } });
  await db.device.deleteMany({ where: { user: { tenantId } } });
  await db.mobileCredential.deleteMany({ where: { user: { tenantId } } });
  await db.otpCode.deleteMany({ where: { phone: { in: phones } } });
  await db.session.deleteMany({ where: { user: { tenantId } } });
  await db.user.deleteMany({ where: { tenantId } });
  await db.subscription.deleteMany({ where: { tenantId } });
  await db.structure.delete({ where: { id: tenantId } });
}

export interface MobileSession {
  user: { id: string; phone: string; role: string };
  device: { id: string; label: string };
  tokens: { accessToken: string; refreshToken: string };
}

/** Connexion mobile COMPLÈTE : login → OTP (mode dev : code renvoyé) → jetons. */
export async function mobileLogin(
  url: string,
  phone: string,
  pin: string,
  deviceLabel: string,
  deviceId?: string
): Promise<{ session: MobileSession; loginBody: Record<string, unknown> }> {
  const loginRes = await fetch(`${url}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, pin, deviceId, deviceLabel }),
  });
  const loginBody = (await loginRes.json()) as Record<string, unknown>;
  if (loginRes.status !== 200) throw new Error(`login inattendu ${loginRes.status}: ${JSON.stringify(loginBody)}`);

  let session: MobileSession;
  if (loginBody.status === "otp_required") {
    const verifyRes = await fetch(`${url}/v1/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: loginBody.challengeId,
        code: loginBody.devCode,
        deviceLabel,
      }),
    });
    const verifyBody = (await verifyRes.json()) as Record<string, unknown>;
    if (verifyRes.status !== 200) throw new Error(`otp/verify inattendu ${verifyRes.status}: ${JSON.stringify(verifyBody)}`);
    session = {
      user: verifyBody.user as MobileSession["user"],
      device: verifyBody.device as MobileSession["device"],
      tokens: verifyBody.tokens as unknown as MobileSession["tokens"],
    };
  } else {
    session = {
      user: loginBody.user as MobileSession["user"],
      device: loginBody.device as MobileSession["device"],
      tokens: loginBody.tokens as unknown as MobileSession["tokens"],
    };
  }
  return { session, loginBody };
}

export function bearer(session: MobileSession): { Authorization: string; "Content-Type": string } {
  return { Authorization: `Bearer ${session.tokens.accessToken}`, "Content-Type": "application/json" };
}
