// TontiHelm — POST /v1/auth/* : authentification mobile du personnel (phase 1, §8.7).
//   login       : téléphone + PIN 6 chiffres → appareil connu = jetons directs
//                 (agent/contrôleur/admin) ; NOUVEL appareil, ou dirigeant/gérant
//                 (second facteur à CHAQUE connexion), = défi OTP par SMS ;
//   otp/verify  : consomme le code → enregistre l'appareil → jetons ;
//   refresh     : rotation du jeton de renouvellement (30 j glissants) ;
//   logout      : révoque le jeton présenté ;
//   me          : session courante (+ abonnement, comme /api/auth/me).
// Aucune modification de /api/auth/* : les deux canaux coexistent.
import { Router } from "express";
import { db } from "../../lib/db";
import { verifyPin, ApiError, h } from "../../lib/auth";
import { appendAudit } from "../../lib/audit";
import { getSubscription } from "../../lib/tenant";
import { MobileLoginSchema, OtpVerifySchema, RefreshSchema, LogoutSchema } from "../../lib/schemas/auth";
import { normalizePhoneBenin, DeviceLabelSchema } from "../../lib/schemas/common";
import {
  ACCESS_TOKEN_TTL_MS,
  PIN_LOCK_MS,
  PIN_MAX_ATTEMPTS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_HOUR,
  OTP_TTL_MS,
  deliverOtp,
  generateOtp,
  hashPinMobile,
  issueMobileTokens,
  otpHash,
  requireMobileUser,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyPinMobile,
} from "../../lib/mobile-auth";

const router = Router();

/** Rôles soumis au second facteur à CHAQUE connexion (§8.7 : dirigeant et gérant). */
const TWO_FACTOR_ROLES = new Set(["owner", "manager"]);

type WebUser = {
  id: string;
  tenantId: string | null;
  phone: string;
  fullName: string;
  role: string;
  pinHash: string;
  status: string;
  structure: { name: string; kind: string; status: string } | null;
};

function publicUser(u: WebUser) {
  return {
    id: u.id,
    phone: u.phone,
    fullName: u.fullName,
    role: u.role,
    tenantId: u.tenantId,
    structureName: u.structure?.name ?? null,
    structureKind: u.structure?.kind ?? null,
    structureStatus: u.structure?.status ?? null,
  };
}

async function findUserByPhone(phoneRaw: string): Promise<WebUser | null> {
  const candidates = normalizePhoneBenin(phoneRaw);
  const found = await Promise.all(
    candidates.map((phone) =>
      db.user.findUnique({
        where: { phone },
        include: { structure: { select: { name: true, kind: true, status: true } } },
      })
    )
  );
  return found.find((u) => u !== null) ?? null;
}

/** Journalise une connexion réussie (même action « login » que le web, source mobile). */
async function auditLogin(user: WebUser, deviceId: string, twoFactor: boolean): Promise<void> {
  if (!user.tenantId) return; // admin plateforme : pas de structure, comme le web
  await appendAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "login",
    entity: "user",
    entityId: user.id,
    payload: { phone: user.phone, role: user.role, source: "mobile", deviceId, twoFactor },
  });
}

// ── POST /v1/auth/login ──
router.post(
  "/login",
  h(async (req, res) => {
    const body = MobileLoginSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Formulaire incomplet.";
      throw new ApiError("invalid_input", issue);
    }
    const user = await findUserByPhone(body.data.phone);
    if (!user) {
      throw new ApiError("bad_credentials", "Numéro ou code PIN incorrect. Réessaie.", 401);
    }

    // ── Verrouillage 15 min après 5 essais erronés (durable en base) ──
    // La credential existe dès le premier essai (sentinelle « none ») pour que
    // le comptage survive à un redémarrage ; elle ne porte aucun hash utile
    // tant que le vrai PIN n'a pas été vérifié une première fois.
    let credential = await db.mobileCredential.findUnique({ where: { userId: user.id } });
    if (!credential) {
      credential = await db.mobileCredential.create({ data: { userId: user.id, pinHash: "none" } });
    }
    if (credential.lockedUntil && credential.lockedUntil > new Date()) {
      const reste = Math.ceil((credential.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ApiError(
        "pin_locked",
        `Trop d'essais : ton code PIN est verrouillé. Réessaie dans ${reste} minute${reste > 1 ? "s" : ""}.`,
        403
      );
    }

    // ── Vérification du PIN : Argon2id (canal mobile) ; à la première
    // connexion mobile, vérification contre le scrypt du web puis création du
    // hash Argon2id (migration transparente — le web garde son scrypt). ──
    const pinOk =
      credential.pinHash === "none"
        ? verifyPin(body.data.pin, user.pinHash)
        : verifyPinMobile(body.data.pin, credential.pinHash);

    if (!pinOk) {
      const attempts = credential.failedAttempts + 1;
      if (attempts >= PIN_MAX_ATTEMPTS) {
        await db.mobileCredential.update({
          where: { userId: user.id },
          data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + PIN_LOCK_MS) },
        });
        throw new ApiError(
          "pin_locked",
          "Trop d'essais : ton code PIN est verrouillé pendant 15 minutes.",
          403
        );
      }
      await db.mobileCredential.update({
        where: { userId: user.id },
        data: { failedAttempts: attempts },
      });
      const reste = PIN_MAX_ATTEMPTS - attempts;
      throw new ApiError(
        "bad_credentials",
        `Numéro ou code PIN incorrect. Réessaie.${reste <= 2 ? ` ${reste} essai${reste > 1 ? "s" : ""} avant verrouillage.` : ""}`,
        401
      );
    }

    // PIN correct : compteur remis à zéro + migration Argon2id au besoin.
    if (credential.pinHash === "none") {
      await db.mobileCredential.update({
        where: { userId: user.id },
        data: { pinHash: hashPinMobile(body.data.pin), failedAttempts: 0, lockedUntil: null },
      });
    } else if (credential.failedAttempts !== 0 || credential.lockedUntil) {
      await db.mobileCredential.update({
        where: { userId: user.id },
        data: { failedAttempts: 0, lockedUntil: null },
      });
    }

    if (user.status !== "active") {
      throw new ApiError("user_inactive", "Ton compte est désactivé. Contacte ton gérant.", 403);
    }

    // ── Appareil connu ? (identifiant conservé par le téléphone) ──
    let device: { id: string; label: string } | null = null;
    if (body.data.deviceId) {
      device = await db.device.findFirst({
        where: { id: body.data.deviceId, userId: user.id, revokedAt: null },
        select: { id: true, label: true },
      });
    }

    // Second facteur : nouvel appareil (tous les rôles) OU dirigeant/gérant
    // à chaque connexion (§8.7). Les autres rôles sur appareil connu entrent
    // directement — la fluidité du terrain est la règle du web.
    const needsOtp = !device || TWO_FACTOR_ROLES.has(user.role);
    if (needsOtp) {
      // Nouvel appareil : nom lisible obligatoire (liste de révocation du gérant).
      if (!device) {
        const label = DeviceLabelSchema.safeParse(body.data.deviceLabel ?? "");
        if (!label.success) {
          throw new ApiError("invalid_input", label.error.issues[0]?.message ?? "Nomme l'appareil.");
        }
      }
      // Plafond d'envoi : 3 codes / heure / numéro.
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const sent = await db.otpCode.count({ where: { phone: user.phone, createdAt: { gte: since } } });
      if (sent >= OTP_MAX_PER_HOUR) {
        throw new ApiError(
          "otp_rate_limited",
          "Trop de codes envoyés sur ce numéro. Attends une heure avant de recommencer.",
          429
        );
      }
      const code = generateOtp();
      const delivery = await deliverOtp(user.phone, code);
      const challenge = await db.otpCode.create({
        data: {
          phone: user.phone,
          codeHash: otpHash(code),
          purpose: device ? "device_login_2fa" : "device_registration",
          deviceId: device?.id ?? null,
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      });
      res.json({
        status: "otp_required",
        challengeId: challenge.id,
        otpSent: true,
        // Hors production uniquement : deliverOtp refuse en production sans passerelle.
        devCode: delivery.devCode,
        requiresDeviceLabel: !device,
        user: publicUser(user),
      });
      return;
    }

    // Appareil connu, sans second facteur : jetons directs.
    const tokens = await issueMobileTokens(user, device!.id);
    await auditLogin(user, device!.id, false);
    res.json({
      status: "authenticated",
      user: publicUser(user),
      device: { id: device!.id, label: device!.label },
      tokens,
      accessTokenTtlMs: ACCESS_TOKEN_TTL_MS,
    });
  })
);

// ── POST /v1/auth/otp/verify ──
router.post(
  "/otp/verify",
  h(async (req, res) => {
    const body = OtpVerifySchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Formulaire incomplet.";
      throw new ApiError("invalid_input", issue);
    }
    const challenge = await db.otpCode.findUnique({ where: { id: body.data.challengeId } });
    if (!challenge || challenge.consumedAt) {
      throw new ApiError("invalid_challenge", "Demande de code introuvable. Reconnecte-toi.", 401);
    }
    if (challenge.expiresAt < new Date()) {
      throw new ApiError("otp_expired", "Code expiré. Reconnecte-toi pour en recevoir un nouveau.", 401);
    }
    if (challenge.codeHash !== otpHash(body.data.code)) {
      const attempts = challenge.attempts + 1;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await db.otpCode.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date(), attempts },
        });
        throw new ApiError("otp_max_attempts", "Trop d'essais sur ce code. Reconnecte-toi.", 401);
      }
      await db.otpCode.update({ where: { id: challenge.id }, data: { attempts } });
      throw new ApiError("bad_otp", "Code incorrect. Réessaie.", 401);
    }
    await db.otpCode.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });

    const user = await findUserByPhone(challenge.phone);
    if (!user || user.status !== "active") {
      throw new ApiError("user_inactive", "Ton compte est désactivé. Contacte ton gérant.", 403);
    }

    // Enregistrement du nouvel appareil, ou second facteur sur appareil connu.
    let deviceId: string;
    let deviceLabel: string;
    if (challenge.purpose === "device_registration") {
      const label = DeviceLabelSchema.safeParse(body.data.deviceLabel ?? "");
      if (!label.success) {
        throw new ApiError("invalid_input", label.error.issues[0]?.message ?? "Nomme l'appareil.");
      }
      const device = await db.device.create({ data: { userId: user.id, label: label.data } });
      deviceId = device.id;
      deviceLabel = label.data;
      if (user.tenantId) {
        await appendAudit({
          tenantId: user.tenantId,
          actorId: user.id,
          action: "device_registered",
          entity: "device",
          entityId: device.id,
          payload: { label: label.data, user: user.fullName, role: user.role, source: "mobile" },
        });
      }
    } else {
      const device = challenge.deviceId
        ? await db.device.findFirst({ where: { id: challenge.deviceId, userId: user.id, revokedAt: null } })
        : null;
      if (!device) {
        throw new ApiError(
          "device_revoked",
          "Cet appareil a été révoqué. Reconnecte-toi et réenregistre l'appareil.",
          403
        );
      }
      deviceId = device.id;
      deviceLabel = device.label;
    }

    const tokens = await issueMobileTokens(user, deviceId);
    await auditLogin(user, deviceId, true);
    res.json({
      status: "authenticated",
      user: publicUser(user),
      device: { id: deviceId, label: deviceLabel },
      tokens,
      accessTokenTtlMs: ACCESS_TOKEN_TTL_MS,
    });
  })
);

// ── POST /v1/auth/refresh — rotation du jeton de renouvellement. ──
router.post(
  "/refresh",
  h(async (req, res) => {
    const body = RefreshSchema.safeParse(req.body ?? {});
    if (!body.success) {
      throw new ApiError("invalid_input", "Jeton de renouvellement invalide.");
    }
    const tokens = await rotateRefreshToken(body.data.refreshToken);
    res.json({ status: "rotated", tokens, accessTokenTtlMs: ACCESS_TOKEN_TTL_MS });
  })
);

// ── POST /v1/auth/logout — révoque le jeton présenté (appareil conservé). ──
router.post(
  "/logout",
  h(async (req, res) => {
    const body = LogoutSchema.safeParse(req.body ?? {});
    if (body.success && body.data.refreshToken) {
      await revokeRefreshToken(body.data.refreshToken);
    }
    res.json({ ok: true });
  })
);

// ── GET /v1/auth/me — session courante (+ abonnement), comme /api/auth/me. ──
router.get(
  "/me",
  h(async (req, res) => {
    const { user, device } = await requireMobileUser(req);
    let subscription: { plan: string; status: string; periodEnd: Date | null } | null = null;
    if (user.tenantId) {
      const sub = await getSubscription(user.tenantId);
      subscription = sub ? { plan: sub.plan, status: sub.status, periodEnd: sub.periodEnd } : null;
    }
    res.json({ user, device, subscription });
  })
);

export default router;
