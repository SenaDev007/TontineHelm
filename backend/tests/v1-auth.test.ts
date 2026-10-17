// TontiHelm — tests /v1/auth (phase 1, PARITE.md §8.7) :
//  1. enregistrement d'appareil par OTP (mode dev : code renvoyé) + jetons ;
//  2. migration transparente du PIN : scrypt du web → Argon2id mobile ;
//  3. appareil connu = jetons directs (agent) ; dirigeant = second facteur
//     à CHAQUE connexion, même appareil connu ;
//  4. verrouillage 15 min après 5 essais erronés (durable en base) ;
//  5. rotation du jeton de renouvellement : rejeu réseau idempotent, jeton
//     mort refusé, expiration refusée, logout ;
//  6. listing/révocation d'appareils + coupure immédiate + audit ;
//  7. plafond OTP (3/h/numéro), mauvais code ×5, défis consommés.
// Budget OTP : 3 envois/heure/numéro — chaque téléphone de test en consomme
// exactement 3 (sessions créées dans beforeAll + un dernier à la fin).
// Exécution : cd backend && DATABASE_URL="file:dev.db" bun test
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "../src/lib/db";
import { startApp, seed, cleanup, mobileLogin, type SeedResult, type MobileSession } from "./helpers/v1";
import type { Server } from "http";

let server: Server;
let url: string;
let data: SeedResult;
let agentSession: MobileSession;
let agentLoginBody: Record<string, unknown>;
let agentSecond: MobileSession; // second appareil (Tecno) — sert aussi à la révocation
let ownerSession: MobileSession;

/** Connexion sur appareil CONNU : aucun OTP (agent), réponse directe. */
async function directLogin(phone: string, pin: string, deviceId: string) {
  const res = await fetch(`${url}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, pin, deviceId }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  ({ server, url } = await startApp());
  data = await seed("V1 Auth E2E", "10101");
  const first = await mobileLogin(url, data.agent.phone, data.agent.pin, "Samsung A15 de Yao");
  agentSession = first.session;
  agentLoginBody = first.loginBody;
  agentSecond = (await mobileLogin(url, data.agent.phone, data.agent.pin, "Tecno Spark 20")).session;
  ownerSession = (await mobileLogin(url, data.owner.phone, data.owner.pin, "iPhone de la patronne")).session;
});

afterAll(async () => {
  await cleanup(data);
  server.close();
  await db.$disconnect?.();
});

describe("/v1/auth — enregistrement d'appareil et jetons", () => {
  test("première connexion : OTP obligatoire (mode dev : code renvoyé), appareil créé, jetons complets", () => {
    expect(agentLoginBody.status).toBe("otp_required");
    expect(agentLoginBody.devCode).toMatch(/^\d{6}$/);
    expect(agentSession.user.role).toBe("agent");
    expect(agentSession.user.structureName).toBe("V1 Auth E2E");
    expect(agentSession.device.label).toBe("Samsung A15 de Yao");
    expect(agentSession.tokens.accessToken).toMatch(/.+\..+/);
    expect(agentSession.tokens.refreshToken).toHaveLength(64);
  });

  test("le PIN Argon2id a été créé à la première connexion (migration web → mobile, scrypt intact)", async () => {
    const credential = await db.mobileCredential.findUnique({ where: { userId: data.agent.id } });
    expect(credential?.pinHash.startsWith("argon2id$")).toBe(true);
    const user = await db.user.findUnique({ where: { id: data.agent.id } });
    expect(user!.pinHash.startsWith("scrypt$")).toBe(true); // le web garde son canal
    const deviceRow = await db.device.findUnique({ where: { id: agentSession.device.id } });
    expect(deviceRow?.revokedAt).toBeNull();
  });

  test("le jeton d'accès expire à 15 minutes (payload signé)", () => {
    const payload = JSON.parse(
      Buffer.from(agentSession.tokens.accessToken.split(".")[0], "base64url").toString()
    ) as { iat: number; exp: number; did: string };
    expect(payload.exp - payload.iat).toBe(15 * 60 * 1000);
    expect(payload.did).toBe(agentSession.device.id);
  });

  test("appareil connu : jetons directs pour l'agent, SANS OTP", async () => {
    const { status, body } = await directLogin(data.agent.phone, data.agent.pin, agentSession.device.id);
    expect(status).toBe(200);
    expect(body.status).toBe("authenticated");
    expect(body.devCode).toBeUndefined();
    expect((body.device as { id: string }).id).toBe(agentSession.device.id);
  });

  test("dirigeant : second facteur OTP à CHAQUE connexion, même appareil connu", async () => {
    const { status, body } = await directLogin(data.owner.phone, data.owner.pin, ownerSession.device.id);
    expect(status).toBe(200);
    expect(body.status).toBe("otp_required");
    expect(body.requiresDeviceLabel).toBe(false); // appareil déjà connu
  });

  test("/v1/auth/me renvoie session + abonnement", async () => {
    const res = await fetch(`${url}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${agentSession.tokens.accessToken}` },
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect((body.user as { phone: string }).phone).toBe(data.agent.phone);
    expect((body.subscription as { plan: string }).plan).toBe("pro");
    expect((body.device as { label: string }).label).toBe("Samsung A15 de Yao");
  });

  test("numéro saisi sans préfixe : normalisation béninoise (+229)", async () => {
    const local = data.agent.phone.replace("+229", "");
    const { status, body } = await directLogin(local, data.agent.pin, agentSession.device.id);
    expect(status).toBe(200);
    expect((body.user as { id: string }).id).toBe(data.agent.id);
  });

  test("numéro inconnu : refus générique du web (aucune divulgation)", async () => {
    const res = await fetch(`${url}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+22990000000", pin: "123456", deviceLabel: "Appareil inconnu" }),
    });
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(res.status).toBe(401);
    expect(body.error.code).toBe("bad_credentials");
  });
});

describe("/v1/auth — verrouillage du PIN (5 essais → 15 min)", () => {
  test("cinq échecs verrouillent, le bon PIN reste refusé, verrou DURABLE en base", async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${url}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: data.owner.phone, pin: "000000", deviceLabel: "Appareil douteux" }),
      });
      const body = (await res.json()) as { error: { code: string } };
      // Essais 1 à 4 : 401 ; le 5e déclenche le verrou → 403 pin_locked direct.
      if (i < 4) {
        expect(res.status).toBe(401);
        expect(body.error.code).toBe("bad_credentials");
      } else {
        expect(res.status).toBe(403);
        expect(body.error.code).toBe("pin_locked");
      }
    }
    const locked = await fetch(`${url}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: data.owner.phone, pin: data.owner.pin, deviceLabel: "Appareil légitime" }),
    });
    const body = (await locked.json()) as { error: { code: string; message: string } };
    expect(locked.status).toBe(403);
    expect(body.error.code).toBe("pin_locked");
    expect(body.error.message).toContain("verrouillé");
    const credential = await db.mobileCredential.findUnique({ where: { userId: data.owner.id } });
    expect(credential?.lockedUntil && credential.lockedUntil > new Date()).toBe(true);
    // Lever artificiellement le verrou pour la suite de la suite (test seulement).
    await db.mobileCredential.update({
      where: { userId: data.owner.id },
      data: { lockedUntil: null, failedAttempts: 0 },
    });
  });
});

describe("/v1/auth — rotation du jeton de renouvellement", () => {
  test("rotation valide → nouvelle paire ; rejeu immédiat → MÊME paire (réseau perdu) ; rejeu tardif → 401", async () => {
    const r1 = await fetch(`${url}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: agentSession.tokens.refreshToken }),
    });
    const b1 = (await r1.json()) as { tokens: { refreshToken: string; accessToken: string } };
    expect(r1.status).toBe(200);
    expect(b1.tokens.refreshToken).not.toBe(agentSession.tokens.refreshToken);

    // Le réseau a mangé la réponse : le téléphone REJOUE l'ancien jeton.
    const r2 = await fetch(`${url}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: agentSession.tokens.refreshToken }),
    });
    const b2 = (await r2.json()) as { tokens: { refreshToken: string } };
    expect(r2.status).toBe(200);
    expect(b2.tokens.refreshToken).toBe(b1.tokens.refreshToken); // idempotence

    // Pivot suivant, puis rejeu du TOUT premier : sa paire sauvegardée est
    // morte → refus net (401), sans verrouiller l'appareil légitime.
    const r3 = await fetch(`${url}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: b1.tokens.refreshToken }),
    });
    expect(r3.status).toBe(200);
    const r4 = await fetch(`${url}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: agentSession.tokens.refreshToken }),
    });
    const b4 = (await r4.json()) as { error: { code: string } };
    expect(r4.status).toBe(401);
    expect(b4.error.code).toBe("invalid_refresh");
  });

  test("jeton de renouvellement expiré → 401 invalid_refresh", async () => {
    await db.mobileToken.updateMany({
      where: { device: { id: agentSecond.device.id } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await fetch(`${url}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: agentSecond.tokens.refreshToken }),
    });
    const body = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(401);
    expect(body.error.code).toBe("invalid_refresh");
  });

  test("logout révoque le jeton présenté ; l'appareil reste enregistré", async () => {
    const fresh = await directLogin(data.agent.phone, data.agent.pin, agentSession.device.id);
    const tokens = fresh.body.tokens as unknown as { refreshToken: string };
    const out = await fetch(`${url}/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    expect(out.status).toBe(200);
    const res = await fetch(`${url}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    expect(res.status).toBe(401);
    const deviceRow = await db.device.findUnique({ where: { id: agentSession.device.id } });
    expect(deviceRow?.revokedAt).toBeNull(); // toujours enregistré
  });
});

describe("/v1/devices — listing et révocation", () => {
  test("l'agent liste SES appareils (le courant marqué) ; le dirigeant liste ceux de sa structure", async () => {
    const res = await fetch(`${url}/v1/devices`, {
      headers: { Authorization: `Bearer ${agentSession.tokens.accessToken}` },
    });
    const body = (await res.json()) as { devices: { id: string; current?: boolean; label: string }[] };
    expect(res.status).toBe(200);
    expect(body.devices.some((d) => d.current === true)).toBe(true);
    expect(body.devices.length).toBeGreaterThanOrEqual(2); // Samsung + Tecno

    const res2 = await fetch(`${url}/v1/devices?userId=${data.agent.id}`, {
      headers: { Authorization: `Bearer ${ownerSession.tokens.accessToken}` },
    });
    const body2 = (await res2.json()) as { devices: { id: string }[] };
    expect(res2.status).toBe(200);
    expect(body2.devices.some((d) => d.id === agentSecond.device.id)).toBe(true);
  });

  test("révocation par le dirigeant → coupure immédiate (403 device_revoked) + audit chaîné", async () => {
    const res = await fetch(`${url}/v1/devices/${agentSecond.device.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ownerSession.tokens.accessToken}` },
    });
    expect(res.status).toBe(200);
    const me = await fetch(`${url}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${agentSecond.tokens.accessToken}` },
    });
    const body = (await me.json()) as { error: { code: string } };
    expect(me.status).toBe(403);
    expect(body.error.code).toBe("device_revoked");
    const audit = await db.auditLog.findFirst({
      where: { tenantId: data.tenantId, action: "device_revoked", entityId: agentSecond.device.id },
    });
    expect(audit).not.toBeNull();
  });
});

describe("/v1/auth — OTP : essais et plafond horaire", () => {
  test("mauvais code ×5 → défi épuisé ; le bon code ensuite → refus (défi consommé)", async () => {
    const login = await fetch(`${url}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: data.agent.phone, pin: data.agent.pin, deviceLabel: "Appareil OTP X" }),
    });
    const loginBody = (await login.json()) as { status: string; challengeId: string; devCode: string };
    expect(loginBody.status).toBe("otp_required");
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${url}/v1/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: loginBody.challengeId, code: "000000" }),
      });
      expect(res.status).toBe(401);
    }
    const res = await fetch(`${url}/v1/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: loginBody.challengeId, code: loginBody.devCode }),
    });
    const body = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(401);
    expect(body.error.code).toBe("invalid_challenge"); // consommé après épuisement
  });

  test("plafond : au 4e envoi dans l'heure sur un même numéro → 429 otp_rate_limited", async () => {
    // Filet de sécurité : si un test précédent a verrouillé le PIN, on lève.
    await db.mobileCredential.update({
      where: { userId: data.owner.id },
      data: { lockedUntil: null, failedAttempts: 0 },
    }).catch(() => undefined);
    // Dirigeante : 1 envoi en beforeAll + 1 au test 2FA = 2 déjà comptés.
    let sawOtp = false;
    let limited = false;
    for (let i = 0; i < 3 && !limited; i += 1) {
      const res = await fetch(`${url}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: data.owner.phone, pin: data.owner.pin, deviceLabel: `Appareil plafond ${i}` }),
      });
      const body = (await res.json()) as { status?: string; error?: { code: string } };
      if (res.status === 429) {
        expect(body.error?.code).toBe("otp_rate_limited");
        limited = true;
      } else {
        expect(body.status).toBe("otp_required"); // 3e envoi : encore permis
        sawOtp = true;
      }
    }
    expect(sawOtp).toBe(true);
    expect(limited).toBe(true);
  });
});
