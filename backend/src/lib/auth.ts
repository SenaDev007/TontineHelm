// TontiHelm — authentification : téléphone + PIN à 6 chiffres, sessions en base.
// Deux canaux de jeton : en-tête Authorization Bearer (frontend Vercel ↔ API Railway,
// domaines distincts) et cookie httpOnly (même origine / passerelle).
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { db } from "./db";

export const SESSION_COOKIE = "tontihelm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours (session agent)

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const candidate = scryptSync(pin, salt, 32);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export interface AuthUser {
  id: string;
  phone: string;
  fullName: string;
  role: "owner" | "manager" | "agent" | "controller" | "admin";
  tenantId: string | null;
  status: string;
  structureName?: string | null;
  structureKind?: string | null;
  structureStatus?: string | null;
}

/** Extrait le jeton de session : en-tête Bearer d'abord, cookie ensuite, puis
 * paramètre d'URL ?token= (EventSource ne peut PAS poser d'en-tête — le flux
 * temps réel /api/events s'y appuie ; jeton de session ordinaire, même base). */
export function getToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (cookie) return cookie;
  const queryToken = (req.query as Record<string, unknown> | undefined)?.token;
  if (typeof queryToken === "string" && queryToken) return queryToken;
  return null;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { token, userId, expiresAt } });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return token;
}

/** Pose le cookie de session (même origine en préproduction, cross-domain en production). */
export function setSessionCookie(res: Response, token: string): void {
  const crossDomain = process.env.CORS_ORIGINS?.includes(",") || false;
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: crossDomain ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: process.env.CORS_ORIGINS?.includes(",") ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearSession(req: Request): Promise<void> {
  const token = getToken(req);
  if (token) {
    await db.session.deleteMany({ where: { token } }).catch(() => undefined);
  }
}

export async function getCurrentUser(req: Request): Promise<AuthUser | null> {
  const token = getToken(req);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: { include: { structure: { select: { name: true, kind: true, status: true } } } },
    },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const u = session.user;
  return {
    id: u.id,
    phone: u.phone,
    fullName: u.fullName,
    role: u.role as AuthUser["role"],
    tenantId: u.tenantId,
    status: u.status,
    structureName: u.structure?.name ?? null,
    structureKind: u.structure?.kind ?? null,
    structureStatus: u.structure?.status ?? null,
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Réponse d'erreur au format unique : code lisible par machine + message en français. */
export function errorResponse(err: unknown, res: Response): Response {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error("[api] erreur inattendue", err);
  return res
    .status(500)
    .json({ error: { code: "internal_error", message: "Une erreur inattendue est survenue. Réessaie." } });
}

/** Enveloppe un gestionnaire asynchrone : les ApiError tombent dans le gestionnaire d'erreurs. */
export function h(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: (err: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

/** Middleware final Express : même format d'erreur que errorResponse. */
export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: (err?: unknown) => void
): void {
  void errorResponse(err, res);
}

export async function requireUser(req: Request): Promise<AuthUser> {
  const user = await getCurrentUser(req);
  if (!user) throw new ApiError("unauthorized", "Session expirée. Reconnecte-toi.", 401);
  return user;
}

export function requireRole(user: AuthUser, roles: AuthUser["role"][]): void {
  if (!roles.includes(user.role)) {
    throw new ApiError("forbidden", "Tu n'as pas le droit d'effectuer cette action.", 403);
  }
}

export function requireTenant(user: AuthUser): string {
  if (!user.tenantId) {
    throw new ApiError("no_structure", "Aucune structure rattachée à ton compte.", 403);
  }
  return user.tenantId;
}
