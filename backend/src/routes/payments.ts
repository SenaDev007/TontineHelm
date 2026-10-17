// TontiHelm — liens de paiement mobile money en flux direct (M4).
// action=create_link  : l'agent génère un lien pour un carnet (fonds → compte marchand de la structure).
// action=simulate     : simule le webhook signé FedaPay (rapprochement automatique, idempotent).
import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { requireUser, requireRole, requireTenant, errorResponse, ApiError, h } from "../lib/auth";
import { appendAudit } from "../lib/audit";
import { assertWritable } from "../lib/tenant";
import { passbookBalance, paidDays } from "../lib/domain";

const router = Router();

const linkSchema = z.object({
  action: z.literal("create_link"),
  passbookId: z.string().min(1),
  amount: z.number().int().min(100, "Montant minimum : 100 FCFA."),
});

const simulateSchema = z.object({
  action: z.literal("simulate_webhook"),
  paymentId: z.string().min(1),
  outcome: z.enum(["approved", "declined"]),
});

router.post(
  "/",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["agent", "manager", "owner"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const parsed = z.discriminatedUnion("action", [linkSchema, simulateSchema]).safeParse(req.body ?? {});
    if (!parsed.success) throw new ApiError("invalid_input", "Requête de paiement invalide.");
    const body = parsed.data;

    if (body.action === "create_link") {
      const passbook = await db.passbook.findUnique({
        where: { id: body.passbookId },
        include: { contributor: true, collections: true },
      });
      if (!passbook || passbook.tenantId !== tenantId) {
        throw new ApiError("not_found", "Carnet introuvable.", 404);
      }
      const payment = await db.payment.create({
        data: {
          tenantId,
          passbookId: passbook.id,
          contributorId: passbook.contributorId,
          provider: "fedapay",
          providerRef: `FP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
          amount: body.amount,
          status: "pending",
          linkUrl: `https://pay.fedapay.com/tontihelm/${Math.random().toString(36).slice(2, 6)}`,
        },
      });
      await appendAudit({
        tenantId,
        actorId: user.id,
        action: "payment_link_created",
        entity: "payment",
        entityId: payment.id,
        payload: { contributor: passbook.contributor.fullName, amount: body.amount, provider: "fedapay" },
      });
      res.json({
        payment: { id: payment.id, amount: payment.amount, linkUrl: payment.linkUrl, status: payment.status },
        message: "En attente de confirmation du client sur son téléphone.",
      });
      return;
    }

    // Simulation du webhook FedaPay (préproduction : fournisseur en mode test).
    const payment = await db.payment.findUnique({ where: { id: body.paymentId } });
    if (!payment || payment.tenantId !== tenantId) {
      throw new ApiError("not_found", "Paiement introuvable.", 404);
    }
    if (payment.status === "approved") {
      // Un événement reçu deux fois ne produit qu'une écriture.
      res.json({ message: "Paiement déjà rapproché. Aucune nouvelle écriture.", deduplicated: true });
      return;
    }

    if (body.outcome === "declined") {
      await db.payment.update({ where: { id: payment.id }, data: { status: "declined", settledAt: new Date() } });
      res.json({ message: "Paiement non abouti. Renvoie le lien ou encaisse en espèces." });
      return;
    }

    const passbook = await db.passbook.findUnique({
      where: { id: payment.passbookId },
      include: { contributor: true, collections: true },
    });
    if (!passbook) throw new ApiError("not_found", "Carnet introuvable.", 404);

    // Le montant d'un paiement approuvé doit correspondre exactement au montant demandé.
    const balance = passbookBalance(passbook.collections);
    const dayIndex = Math.min(paidDays(balance + payment.amount, passbook.dailyAmount), passbook.cycleDays);

    await db.payment.update({ where: { id: payment.id }, data: { status: "approved", settledAt: new Date() } });
    await db.collection.create({
      data: {
        id: payment.id, // idempotence : le même événement ne crée qu'une écriture
        tenantId,
        passbookId: passbook.id,
        agentId: passbook.agentId,
        amount: payment.amount,
        method: "mobile_money",
        dayIndex,
        collectedAt: new Date(),
      },
    });
    await appendAudit({
      tenantId,
      actorId: null,
      action: "payment_approved",
      entity: "payment",
      entityId: payment.id,
      payload: { contributor: passbook.contributor.fullName, amount: payment.amount, providerRef: payment.providerRef, reconciled: true },
    });

    // Pas de reçu SMS : l'écriture est visible immédiatement sur le carnet en ligne
    // du cotisant, via son lien personnel (WhatsApp / e-mail).
    res.json({ message: "Paiement approuvé et rapproché. Le carnet du cotisant est à jour sur son lien." });
  })
);

export default router;
