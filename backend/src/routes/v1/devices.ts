// TontiHelm — /v1/devices : appareils enregistrés du personnel (phase 1, §8.5).
//   GET    /v1/devices            → SES appareils (avec l'appareil courant marqué) ;
//   GET    /v1/devices?userId=…    → les appareils d'un membre de SA structure
//                                    (dirigeant/gérant — interface de révocation) ;
//   DELETE /v1/devices/:id         → révocation : soi-même, ou n'importe quel
//                                    appareil de sa structure en tant que
//                                    dirigeant/gérant. Coupe immédiatement les
//                                    jetons et la synchronisation de l'appareil.
// La détection de révocation côté téléphone : /v1/sync/pull et l'authentification
// renvoient l'état de l'appareil (device_revoked) → purge locale à la reconnexion.
import { Router } from "express";
import { db } from "../../lib/db";
import { ApiError, h } from "../../lib/auth";
import { requireRole } from "../../lib/auth";
import { appendAudit } from "../../lib/audit";
import { requireMobileUser, revokeDevice } from "../../lib/mobile-auth";

const router = Router();

function serializeDevice(d: {
  id: string;
  label: string;
  registeredAt: Date;
  lastSyncAt: Date | null;
  revokedAt: Date | null;
  clockSkewMs: number | null;
}, currentId?: string) {
  return {
    id: d.id,
    label: d.label,
    registeredAt: d.registeredAt.toISOString(),
    lastSyncAt: d.lastSyncAt?.toISOString() ?? null,
    revokedAt: d.revokedAt?.toISOString() ?? null,
    clockSkewMs: d.clockSkewMs,
    current: currentId ? d.id === currentId : undefined,
  };
}

// ── GET /v1/devices — liste (les siennes, ou celles d'un membre de la structure). ──
router.get(
  "/",
  h(async (req, res) => {
    const { user, device } = await requireMobileUser(req);

    // Cible : soi-même par défaut ; dirigeant/gérant → tout membre de SA structure.
    let targetUserId = user.id;
    const asked = typeof req.query.userId === "string" ? req.query.userId : null;
    if (asked && asked !== user.id) {
      requireRole(user, ["owner", "manager"]);
      if (!user.tenantId) {
        throw new ApiError("no_structure", "Aucune structure rattachée à ton compte.", 403);
      }
      const target = await db.user.findUnique({ where: { id: asked } });
      if (!target || target.tenantId !== user.tenantId) {
        throw new ApiError("not_found", "Membre introuvable dans ta structure.", 404);
      }
      targetUserId = target.id;
    }

    const devices = await db.device.findMany({
      where: { userId: targetUserId },
      orderBy: { registeredAt: "desc" },
    });
    res.json({
      devices: devices.map((d) => serializeDevice(d, targetUserId === user.id ? device.id : undefined)),
    });
  })
);

// ── DELETE /v1/devices/:id — révocation (soi-même ou gérant de la structure). ──
router.delete(
  "/:id",
  h(async (req, res) => {
    const { user } = await requireMobileUser(req);
    const target = await db.device.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, fullName: true, tenantId: true } } },
    });
    if (!target) {
      throw new ApiError("not_found", "Appareil introuvable.", 404);
    }

    const self = target.userId === user.id;
    if (!self) {
      // Gérant/dirigeant révoque un appareil de SA structure uniquement.
      requireRole(user, ["owner", "manager"]);
      if (!user.tenantId || target.user.tenantId !== user.tenantId) {
        throw new ApiError("not_found", "Appareil introuvable.", 404);
      }
    }
    if (target.revokedAt) {
      res.json({ ok: true, alreadyRevoked: true });
      return;
    }

    await revokeDevice(target.id);
    if (user.tenantId) {
      await appendAudit({
        tenantId: user.tenantId,
        actorId: user.id,
        action: "device_revoked",
        entity: "device",
        entityId: target.id,
        payload: {
          label: target.label,
          owner: target.user.fullName,
          by: self ? "lui-même" : user.fullName,
          source: "mobile",
        },
      });
    }
    res.json({ ok: true });
  })
);

export default router;
