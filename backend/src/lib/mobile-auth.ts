// TontiHelm — authentification MOBILE (canal /v1, phase 1 — PARITE.md §8.7).
// Le canal web (Session opaque 30 jours, PIN scrypt, /api/auth/*) reste
// INTOUCHABLE ; tout ici vit dans des tables séparées :
//   · PIN Argon2id (MobileCredential) — au premier login mobile, le PIN est
//     vérifié contre le scrypt du web puis la credential Argon2id est créée
//     (migration transparente, le web continue de vérifier son scrypt) ;
//   · jeton d'accès signé HMAC-SHA256, validité 15 minutes ;
//   · jeton de renouvellement opaque, rotation à chaque usage, 30 jours
//     glissants liés à l'appareil (MobileToken, stocké haché) ;
//   · verrouillage 15 minutes après 5 essais erronés (durable en base) ;
//   · code unique par SMS pour l'enregistrement d'appareil et le second
//     facteur dirigeant/gérant (OtpCode).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { argon2id } from "@noble/hashes/argon2.js";
import type { Request } from "express";
import { db } from "./db";
import { ApiError } from "./auth";
import type { AuthUser } from "./auth";

// ── Constantes du canal mobile (§8.7) ──
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours glissants
export const PIN_MAX_ATTEMPTS = 5; // puis verrouillage
export const PIN_LOCK_MS = 15 * 60 * 1000; // 15 minutes
export const OTP_TTL_MS = 5 * 60 * 1000; // code valable 5 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_HOUR = 3; // envois par numéro et par heure
const REPLAY_GRACE_MS = 60 * 1000; // rejeu réseau toléré 60 s après rotation

// ── PIN Argon2id (paramètres OWASP : m = 19 Mio, t = 3, p = 1) ──
const ARGON2 = { t: 3, m: 19456, p: 1 } as const;

export function hashPinMobile(pin: string): string {
  const salt = randomBytes(16);
  const digest = argon2id(pin, salt, ARGON2);
  return `argon2id$t=${ARGON2.t},m=${ARGON2.m},p=${ARGON2.p}$${salt.toString("hex")}$${Buffer.from(digest).toString("hex")}`;
}

export function verifyPinMobile(pin: string, stored: string): boolean {
  try {
    const [scheme, params, saltHex, hashHex] = stored.split("$");
    if (scheme !== "argon2id" || !params || !saltHex || !hashHex) return false;
    const p: Record<string, number> = {};
    for (const kv of params.split(",")) {
      const [k, v] = kv.split("=");
      p[k] = Number(v);
    }
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const candidate = Buffer.from(argon2id(pin, salt, { t: p.t, m: p.m, p: p.p }));
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

// ── Jeton d'accès : HMAC compact « base64url(payload).base64url(sig) » ──
const DEV_SECRET =
  "tontihelm-dev-secret-ne-jamais-utiliser-en-production-tontihelm-dev-secret";

function mobileSecret(): string {
  const secret = process.env.MOBILE_TOKEN_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new ApiError(
      "config_missing",
      "MOBILE_TOKEN_SECRET absente : l'authentification mobile est désactivée sur ce déploiement.",
      503
    );
  }
  console.warn(
    "[v1] MOBILE_TOKEN_SECRET absente — secret de DÉVELOPPEMENT utilisé (jamais en production)."
  );
  return DEV_SECRET;
}

export interface MobileAccessClaims {
  uid: string;
  did: string; // deviceId
  role: string;
  iat: number;
  exp: number;
}

export function signAccessToken(userId: string, deviceId: string, role: string): { token: string; expiresAt: Date } {
  const now = Date.now();
  const exp = now + ACCESS_TOKEN_TTL_MS;
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, did: deviceId, role, iat: now, exp })
  ).toString("base64url");
  const sig = createHmac("sha256", mobileSecret()).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, expiresAt: new Date(exp) };
}

export function verifyAccessToken(token: string): MobileAccessClaims | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", mobileSecret()).update(payload).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as MobileAccessClaims;
    if (typeof claims.exp !== "number" || claims.exp < Date.now()) return null;
    if (!claims.uid || !claims.did) return null;
    return claims;
  } catch {
    return null;
  }
}

// ── Jeton de renouvellement : opaque, haché en base, rotation par remplacement ──
function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

async function issueTokens(userId: string, deviceId: string, role: string): Promise<IssuedTokens> {
  const access = signAccessToken(userId, deviceId, role);
  const refresh = randomBytes(32).toString("hex");
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await db.mobileToken.create({
    data: { deviceId, tokenHash: sha256hex(refresh), expiresAt: refreshExpiresAt },
  });
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: refresh,
    refreshTokenExpiresAt: refreshExpiresAt,
  };
}

/** Paire complète à la connexion / vérification OTP / rotation. */
export async function issueMobileTokens(user: { id: string; role: string }, deviceId: string): Promise<IssuedTokens> {
  return issueTokens(user.id, deviceId, user.role);
}

/**
 * Ancien jeton → nouvelle paire, conservé 60 s : si la réponse de la rotation
 * se perd sur le réseau et que le téléphone REJOUE le même jeton, il reçoit
 * exactement la même paire (idempotence) — jamais de déconnexion abusive ;
// au-delà de 60 s le jeton n'existe plus en base : simple 401.
 */
const replayWindow = new Map<string, { tokens: IssuedTokens; until: number }>();

function pruneReplayWindow(): void {
  const now = Date.now();
  for (const [k, v] of replayWindow) {
    if (v.until <= now) replayWindow.delete(k);
  }
}

export async function rotateRefreshToken(refreshToken: string): Promise<IssuedTokens> {
  pruneReplayWindow();
  const tokenHash = sha256hex(refreshToken);

  // Rejeu réseau (réponse perdue) : la même paire est renvoyée mot pour mot,
  // À CONDITION qu'elle soit encore la paire vivante de l'appareil — si le
  // téléphone a déjà pivoté plus loin, le rejeu est simplement refusé (401).
  const replay = replayWindow.get(tokenHash);
  if (replay && replay.until > Date.now()) {
    const stillLive = await db.mobileToken.findUnique({
      where: { tokenHash: sha256hex(replay.tokens.refreshToken) },
    });
    if (stillLive && stillLive.expiresAt > new Date()) {
      return replay.tokens;
    }
    replayWindow.delete(tokenHash);
    throw new ApiError("invalid_refresh", "Session mobile expirée. Reconnecte-toi.", 401);
  }

  const row = await db.mobileToken.findUnique({
    where: { tokenHash },
    include: { device: { include: { user: { select: { role: true } } } } },
  });
  if (!row) {
    throw new ApiError("invalid_refresh", "Session mobile expirée. Reconnecte-toi.", 401);
  }
  if (row.device.revokedAt) {
    throw new ApiError(
      "device_revoked",
      "Cet appareil a été révoqué. Reconnecte-toi et réenregistre l'appareil.",
      403
    );
  }
  if (row.expiresAt < new Date()) {
    await db.mobileToken.delete({ where: { id: row.id } }).catch(() => undefined);
    throw new ApiError("invalid_refresh", "Session mobile expirée. Reconnecte-toi.", 401);
  }
  // Rotation : l'ancienne ligne disparaît d'abord (échec = reconnexion, jamais
  // deux jetons vivants), la nouvelle paire prend le relais (30 j glissants).
  await db.mobileToken.delete({ where: { id: row.id } });
  const tokens = await issueTokens(row.device.userId, row.device.id, row.device.user.role);
  replayWindow.set(tokenHash, { tokens, until: Date.now() + REPLAY_GRACE_MS });
  return tokens;
}

/** Déconnexion : le jeton présenté disparaît (l'appareil reste enregistré). */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await db.mobileToken.deleteMany({ where: { tokenHash: sha256hex(refreshToken) } }).catch(() => undefined);
}

/** Révocation d'appareil : coupe les jetons et la synchronisation, immédiatement. */
export async function revokeDevice(deviceId: string): Promise<void> {
  await db.device.update({ where: { id: deviceId }, data: { revokedAt: new Date() } }).catch(() => undefined);
  await db.mobileToken.deleteMany({ where: { deviceId } }).catch(() => undefined);
}

// ── Contexte d'authentification des routes /v1 protégées ──
export interface MobileDeviceRow {
  id: string;
  userId: string;
  label: string;
  registeredAt: Date;
  revokedAt: Date | null;
  lastSyncAt: Date | null;
  clockSkewMs: number | null;
}

export interface MobileAuthContext {
  user: AuthUser;
  device: MobileDeviceRow;
}

export async function requireMobileUser(req: Request): Promise<MobileAuthContext> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new ApiError("unauthorized", "Session mobile expirée. Reconnecte-toi.", 401);
  }
  const claims = verifyAccessToken(header.slice(7).trim());
  if (!claims) {
    throw new ApiError("unauthorized", "Session mobile expirée. Reconnecte-toi.", 401);
  }
  const device = await db.device.findUnique({
    where: { id: claims.did },
    include: { user: { include: { structure: { select: { name: true, kind: true, status: true } } } } },
  });
  if (!device || device.userId !== claims.uid) {
    throw new ApiError("unauthorized", "Session mobile expirée. Reconnecte-toi.", 401);
  }
  if (device.revokedAt) {
    throw new ApiError(
      "device_revoked",
      "Cet appareil a été révoqué. Reconnecte-toi et réenregistre l'appareil.",
      403
    );
  }
  if (device.user.status !== "active") {
    throw new ApiError("user_inactive", "Ton compte est désactivé. Contacte ton gérant.", 403);
  }
  const u = device.user;
  return {
    user: {
      id: u.id,
      phone: u.phone,
      fullName: u.fullName,
      role: u.role as AuthUser["role"],
      tenantId: u.tenantId,
      status: u.status,
      structureName: u.structure?.name ?? null,
      structureKind: u.structure?.kind ?? null,
      structureStatus: u.structure?.status ?? null,
    },
    device: {
      id: device.id,
      userId: device.userId,
      label: device.label,
      registeredAt: device.registeredAt,
      revokedAt: device.revokedAt,
      lastSyncAt: device.lastSyncAt,
      clockSkewMs: device.clockSkewMs,
    },
  };
}

// ── Code unique par SMS (§8.7) ──
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function otpHash(code: string): string {
  return sha256hex(`otp:${code}`);
}

/**
 * Livraison du code. Aucune passerelle SMS n'est branchée à ce jour (le web
 * n'émet que WhatsApp et FedaPay) : hors production, le code est journalisé et
 * renvoyé dans la réponse (`devCode`) pour le terrain ; EN PRODUCTION sans
 * passerelle, on refuse explicitement — même garde que FedaPay
 * `payment_unconfigured` (503). Aucun envoi n'est jamais simulé en production.
 */
export async function deliverOtp(phone: string, code: string): Promise<{ sent: boolean; devCode?: string }> {
  if (process.env.NODE_ENV === "production") {
    // Point de branchement de la future passerelle SMS — jusqu'ici la
    // production refuse au lieu de prétendre avoir envoyé le code.
    throw new ApiError(
      "sms_unconfigured",
      "Aucune passerelle SMS configurée : impossible d'envoyer le code sur ce déploiement.",
      503
    );
  }
  console.log(`[v1][dev] OTP pour ${phone} : ${code}`);
  return { sent: true, devCode: code };
}
