// TontiHelm — back-office administrateur (§14.17) : file de validation des structures.
import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { requireUser, requireRole, errorResponse, ApiError, h } from "../lib/auth";
import { appendAudit } from "../lib/audit";

const router = Router();

// ── GET /api/admin/structures — file de validation des structures. ──
router.get(
  "/structures",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["admin"]);
    const structures = await db.structure.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        users: { where: { role: "owner" }, select: { fullName: true, phone: true } },
        subscription: { select: { plan: true, status: true } },
        _count: { select: { contributors: true, users: true, collections: true } },
      },
    });
    res.json({
      structures: structures.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        licenseRef: s.licenseRef,
        licenseDocName: s.licenseDocName,
        city: s.city,
        status: s.status,
        createdAt: s.createdAt,
        rejectionNote: s.rejectionNote,
        owner: s.users[0] ?? null,
        plan: s.subscription?.plan ?? null,
        counts: { contributors: s._count.contributors, users: s._count.users, collections: s._count.collections },
      })),
    });
  })
);

// ── POST /api/admin/structures — approbation, refus avec motif, suspension, réactivation. ──
const actionSchema = z.object({
  structureId: z.string().min(1),
  action: z.enum(["approve", "refuse", "suspend", "reactivate"]),
  note: z.string().optional(),
});

router.post(
  "/structures",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["admin"]);
    const body = actionSchema.safeParse(req.body ?? {});
    if (!body.success) throw new ApiError("invalid_input", "Action invalide.");
    const { structureId, action, note } = body.data;

    const structure = await db.structure.findUnique({ where: { id: structureId } });
    if (!structure) throw new ApiError("not_found", "Structure introuvable.", 404);

    if (action === "approve") {
      if (structure.status !== "pending") {
        throw new ApiError("bad_state", "Cette structure n'est plus en attente.");
      }
      await db.structure.update({ where: { id: structureId }, data: { status: "active" } });
      // Période d'essai de 60 jours activée à la validation.
      const trialEndsAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      await db.subscription.upsert({
        where: { tenantId: structureId },
        create: { tenantId: structureId, plan: "demarrage", status: "trial", trialEndsAt },
        update: { status: "trial", trialEndsAt },
      });
      await appendAudit({
        tenantId: structureId,
        actorId: user.id,
        action: "structure_approved",
        entity: "structure",
        entityId: structureId,
        payload: { name: structure.name, decision: "approved", note: note ?? null },
      });
      res.json({ ok: true, message: "Structure validée et activée." });
      return;
    }

    if (action === "refuse") {
      if (structure.status !== "pending") {
        throw new ApiError("bad_state", "Cette structure n'est plus en attente.");
      }
      await db.structure.update({
        where: { id: structureId },
        data: { status: "closed", rejectionNote: note ?? "Justificatif non conforme." },
      });
      res.json({ ok: true, message: "Demande refusée avec motif." });
      return;
    }

    if (action === "suspend") {
      await db.structure.update({
        where: { id: structureId },
        data: { status: "suspended", rejectionNote: note ?? null },
      });
      await appendAudit({
        tenantId: structureId,
        actorId: user.id,
        action: "structure_suspended",
        entity: "structure",
        entityId: structureId,
        payload: { name: structure.name, note: note ?? null },
      });
      res.json({ ok: true, message: "Structure suspendue." });
      return;
    }

    // reactivate
    await db.structure.update({ where: { id: structureId }, data: { status: "active" } });
    await appendAudit({
      tenantId: structureId,
      actorId: user.id,
      action: "structure_reactivated",
      entity: "structure",
      entityId: structureId,
      payload: { name: structure.name },
    });
    res.json({ ok: true, message: "Structure réactivée." });
  })
);

// ── (Les demandes de démonstration ont été retirées : la vitrine propose
//    désormais une démonstration en direct, interactive, sans formulaire.) ──

export default router;
