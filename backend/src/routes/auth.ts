// TontiHelm — routes d'authentification : login, logout, me.
import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import {
  verifyPin,
  createSession,
  setSessionCookie,
  clearSession,
  clearSessionCookie,
  getCurrentUser,
  requireUser,
  errorResponse,
  ApiError,
  h,
} from "../lib/auth";
import { appendAudit } from "../lib/audit";
import { getSubscription } from "../lib/tenant";

const router = Router();

// ── POST /api/auth/login — connexion par téléphone et PIN. ──
const loginSchema = z.object({
  phone: z.string().min(8, "Numéro invalide. Saisis ton numéro complet, sans espace."),
  pin: z.string().regex(/^\d{6}$/, "Code PIN à 6 chiffres."),
});

router.post(
  "/login",
  h(async (req, res) => {
    const body = loginSchema.safeParse(req.body ?? {});
    if (!body.success) {
      throw new ApiError("invalid_input", "Numéro invalide. Saisis ton numéro complet, sans espace.");
    }
    const phone = body.data.phone.replace(/\s+/g, "");
    const user = await db.user.findUnique({
      where: { phone },
      include: { structure: { select: { id: true, name: true, kind: true, status: true } } },
    });
    if (!user || !verifyPin(body.data.pin, user.pinHash)) {
      throw new ApiError("bad_credentials", "Numéro ou code incorrect. Réessaie.", 401);
    }
    if (user.status !== "active") {
      throw new ApiError("user_inactive", "Ton compte est désactivé. Contacte ton gérant.", 403);
    }

    const token = await createSession(user.id);
    setSessionCookie(res, token);

    if (user.tenantId && user.structure) {
      await appendAudit({
        tenantId: user.tenantId,
        actorId: user.id,
        action: "login",
        entity: "user",
        entityId: user.id,
        payload: { phone: user.phone, role: user.role },
      });
    }

    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        structureName: user.structure?.name ?? null,
        structureKind: user.structure?.kind ?? null,
        structureStatus: user.structure?.status ?? null,
      },
    });
  })
);

// ── GET /api/auth/me — utilisateur courant. ──
router.get(
  "/me",
  h(async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) {
      res.json({ user: null, subscription: null });
      return;
    }
    let subscription: { plan: string; status: string; periodEnd: Date | null } | null = null;
    if (user.tenantId) {
      const sub = await getSubscription(user.tenantId);
      subscription = sub ? { plan: sub.plan, status: sub.status, periodEnd: sub.periodEnd } : null;
    }
    res.json({ user, subscription });
  })
);

// ── POST /api/auth/logout — déconnexion. ──
router.post(
  "/logout",
  h(async (req, res) => {
    await clearSession(req);
    clearSessionCookie(res);
    res.json({ ok: true });
  })
);

export default router;
