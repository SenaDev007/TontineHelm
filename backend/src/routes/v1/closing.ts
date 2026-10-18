// TontiHelm — /v1/closing : déclaration de caisse de fin de tournée sur le
// canal mobile (phase 2). MIROIR EXACT des règles de `POST /api/agent/closing`
// (M5) — mêmes bornes (entier ≥ 0), même écart `closingGap`, même upsert du
// jour, même verrou « déjà déclarée », même audit chaîné — mais authentifié
// par l'appareil+jetons /v1 : le web garde sa route cookie INTACTE (écart
// n° 9 du PARITE : fonction conservée, canal adapté). La structure en lecture
// seule (abonnement suspendu, §8.13) reste bloquée par `assertWritable`.
// L'événement SSE de clôture n'est publié qu'à la validation gérant, comme
// sur le web — la déclaration reste silencieuse des deux côtés.
import { Router } from "express";
import { z } from "zod";
import { db } from "../../lib/db";
import { requireRole, requireTenant, ApiError, h } from "../../lib/auth";
import { assertWritable } from "../../lib/tenant";
import { requireMobileUser } from "../../lib/mobile-auth";
import { appendAudit } from "../../lib/audit";
import { closingGap, formatFCFA } from "../../lib/domain";

const router = Router();

const closingSchema = z.object({
  declaredCash: z.number().int().min(0, "Montant invalide."),
});

router.post(
  "/",
  h(async (req, res) => {
    const { user, device } = await requireMobileUser(req);
    requireRole(user, ["agent"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const body = closingSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Déclaration invalide.";
      throw new ApiError("invalid_input", issue);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const existing = await db.closing.findFirst({
      where: { tenantId, agentId: user.id, day: todayStart },
    });
    if (existing && existing.status !== "open") {
      throw new ApiError("already_declared", "Ta caisse du jour est déjà déclarée.", 409);
    }

    // Espèces attendues : somme des encaissements en espèces du jour, hors
    // mobile money — le téléphone ne peut déclarer que file vide (contrôlé
    // côté client), donc tout ce qui est dû est déjà chez le serveur.
    const todayCollections = await db.collection.findMany({
      where: { tenantId, agentId: user.id, collectedAt: { gte: todayStart, lt: todayEnd } },
    });
    const expectedCash = todayCollections.filter((c) => c.method === "cash").reduce((s, c) => s + c.amount, 0);
    const gap = closingGap(body.data.declaredCash, expectedCash);

    const closing = existing
      ? await db.closing.update({
          where: { id: existing.id },
          data: {
            declaredCash: body.data.declaredCash,
            expectedCash,
            gap,
            status: "declared",
            createdAt: new Date(),
          },
        })
      : await db.closing.create({
          data: {
            tenantId,
            agentId: user.id,
            day: todayStart,
            declaredCash: body.data.declaredCash,
            expectedCash,
            gap,
            status: "declared",
          },
        });

    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "closing_declared",
      entity: "closing",
      entityId: closing.id,
      payload: {
        day: todayStart.toISOString().slice(0, 10),
        declaredCash: body.data.declaredCash,
        expectedCash,
        gap,
        source: "closing_v1",
        deviceId: device.id,
      },
    });

    const message =
      gap === 0
        ? "Déclaration enregistrée. Aucun écart avec tes encaissements."
        : `Écart de ${formatFCFA(Math.abs(gap))} entre ta déclaration et tes encaissements. Vérifie la tournée avant de valider.`;

    res.json({
      closing: { id: closing.id, declaredCash: body.data.declaredCash, expectedCash, gap, status: "declared" },
      message,
      serverTime: new Date().toISOString(),
    });
  })
);

export default router;
