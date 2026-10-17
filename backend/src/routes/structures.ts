// TontiHelm — inscription self-service avec souscription payante (patron Academia Helm).
//
// Flux en trois temps, montant TOUJOURS calculé côté serveur :
//   1. POST /register          : valide le formulaire + le plan, crée un
//      SignupPayment « pending » portant le draft complet (PIN hashé) ;
//   2. POST /register/payment  : crée la transaction FedaPay (clé secrète) et
//      renvoie les données du checkout intégré — ou un mode test hors production ;
//   3. POST /register/verify   : relit le statut RÉEL auprès de FedaPay (le
//      navigateur n'est jamais cru) puis, si approuvé, crée la structure ACTIVE,
//      le compte dirigeant, l'abonnement et la facture acquittée — idempotent.
//
// L'ancien flux « demande envoyée, réponse sous 24 h » disparaît : le compte
// est créé et actif dès le paiement confirmé.
import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { hashPin, createSession, setSessionCookie, errorResponse, ApiError, h } from "../lib/auth";
import { appendAudit } from "../lib/audit";
import { PLANS } from "../lib/plans";
import {
  fedapayConfigured,
  fedapayTestMode,
  fedapayCreateTransaction,
  fedapayGetTransaction,
} from "../lib/fedapay";

const router = Router();

/** URL publique du frontend (retours FedaPay) — FRONTEND_URL en production. */
function frontendBaseUrl(): string {
  const raw = process.env.FRONTEND_URL?.trim();
  if (raw && /^https?:\/\//.test(raw)) return raw.replace(/\/+$/, "");
  return "http://localhost:3000";
}

/** Montant de souscription selon le plan et la période (annuel = 10 mois, 2 offerts). */
function planAmount(plan: string, period: string): number {
  const def = PLANS[plan];
  if (!def) throw new ApiError("invalid_plan", "Plan d'abonnement inconnu.");
  return period === "yearly" ? def.price * 10 : def.price;
}

const registerSchema = z.object({
  structureName: z.string().min(2, "Saisis le nom de ta structure."),
  kind: z.enum(["sfd", "groupement", "pme"]),
  licenseRef: z.string().trim().optional(),
  city: z.string().min(2, "Saisis ta ville."),
  ownerName: z.string().min(2, "Saisis ton nom complet."),
  ownerPhone: z.string().regex(/^\+?\d{8,15}$/, "Numéro invalide. Saisis ton numéro complet, sans espace."),
  pin: z.string().regex(/^\d{6}$/, "Code PIN à 6 chiffres."),
  plan: z.enum(["demarrage", "pro", "institution"]),
  billingPeriod: z.enum(["monthly", "yearly"]).default("monthly"),
});

// ── 1. Enregistrement du brouillon + intention de paiement ───────────────────
router.post(
  "/register",
  h(async (req, res) => {
    const body = registerSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Formulaire incomplet.";
      throw new ApiError("invalid_input", issue);
    }
    const data = body.data;
    const ownerPhone = data.ownerPhone.replace(/\s+/g, "");

    const existing = await db.user.findUnique({ where: { phone: ownerPhone } });
    if (existing) {
      throw new ApiError("phone_taken", "Ce numéro a déjà un compte. Connecte-toi ou utilise un autre numéro.");
    }

    const amount = planAmount(data.plan, data.billingPeriod);
    const payment = await db.signupPayment.create({
      data: {
        provider: "fedapay",
        plan: data.plan,
        billingPeriod: data.billingPeriod,
        amount,
        status: "pending",
        draft: JSON.stringify({
          structureName: data.structureName.trim(),
          kind: data.kind,
          licenseRef: data.licenseRef || null,
          city: data.city.trim(),
          ownerName: data.ownerName.trim(),
          ownerPhone,
          pinHash: hashPin(data.pin), // jamais le PIN en clair dans le draft
        }),
      },
    });

    res.json({
      ok: true,
      paymentId: payment.id,
      amount,
      plan: data.plan,
      billingPeriod: data.billingPeriod,
      mode: fedapayConfigured() ? "fedapay" : fedapayTestMode() ? "test" : "unconfigured",
    });
  })
);

// ── 2. Session de paiement : transaction FedaPay ou mode test ────────────────
router.post(
  "/register/payment",
  h(async (req, res) => {
    const parsed = z.object({ paymentId: z.string().min(1) }).safeParse(req.body ?? {});
    if (!parsed.success) throw new ApiError("invalid_input", "Identifiant de paiement manquant.");
    const { paymentId } = parsed.data;
    const payment = await db.signupPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new ApiError("not_found", "Paiement introuvable.", 404);
    if (payment.status === "approved") {
      throw new ApiError("already_paid", "Ce paiement est déjà confirmé — ton espace est actif.");
    }
    if (payment.status === "declined") {
      throw new ApiError("payment_declined", "Ce paiement a été refusé. Reprends l'inscription depuis le début.");
    }

    // Mode test (préproduction) : aucun appel FedaPay, le front affiche la simulation.
    if (!fedapayConfigured()) {
      if (!fedapayTestMode()) {
        throw new ApiError(
          "payment_unconfigured",
          "Le paiement en ligne n'est pas encore activé sur ce service. Contacte le support TontiHelm.",
          503,
        );
      }
      res.json({ ok: true, mode: "test", paymentId: payment.id, amount: payment.amount });
      return;
    }

    // Une transaction FedaPay existe déjà ? On la réutilise (retour en arrière,
    // double-clic) au lieu d'en empiler une nouvelle.
    if (payment.providerRef) {
      res.json({
        ok: true,
        mode: "fedapay",
        paymentId: payment.id,
        amount: payment.amount,
        checkout: {
          public_key: process.env.FEDAPAY_PUBLIC_KEY,
          transaction: { id: payment.providerRef, amount: payment.amount, description: `Abonnement TontiHelm — ${payment.plan}` },
          customer: { lastname: draftOf(payment).ownerName ?? "", phone_number: draftOf(payment).ownerPhone ?? "" },
        },
        paymentUrl: null,
      });
      return;
    }

    const draft = draftOf(payment);
    const callbackUrl = `${frontendBaseUrl()}/inscription?paymentId=${payment.id}&status=return`;
    try {
      const tx = await fedapayCreateTransaction({
        amount: payment.amount,
        description: `Abonnement TontiHelm ${PLANS[payment.plan].label} — ${draft.structureName}`,
        callbackUrl,
        metadata: {
          type: "signup",
          paymentId: payment.id,
          plan: payment.plan,
          billingPeriod: payment.billingPeriod,
          structureName: draft.structureName,
          ownerPhone: draft.ownerPhone,
        },
        customer: { lastname: draft.ownerName, phone_number: draft.ownerPhone },
      });
      await db.signupPayment.update({
        where: { id: payment.id },
        data: { providerRef: tx.transactionId },
      });
      res.json({
        ok: true,
        mode: "fedapay",
        paymentId: payment.id,
        amount: payment.amount,
        checkout: {
          public_key: process.env.FEDAPAY_PUBLIC_KEY,
          transaction: { id: tx.transactionId, amount: payment.amount, description: `Abonnement TontiHelm — ${payment.plan}` },
          customer: { lastname: draft.ownerName ?? "", phone_number: draft.ownerPhone ?? "" },
        },
        paymentUrl: tx.paymentUrl,
      });
    } catch (err) {
      // FedaPay injoignable ou configuration refusée : on ne bloque pas le
      // formulaire, on renvoie l'erreur réelle pour affichage.
      throw new ApiError(
        "payment_provider_error",
        err instanceof Error ? err.message : "FedaPay est momentanément injoignable. Réessaie dans un instant.",
        502,
      );
    }
  })
);

// ── 3. Vérification du statut réel + activation idempotente ──────────────────
router.post(
  "/register/verify",
  h(async (req, res) => {
    const schema = z.object({
      paymentId: z.string().min(1),
      outcome: z.enum(["approved", "declined"]).optional(), // mode test uniquement
    });
    const body = schema.safeParse(req.body ?? {});
    if (!body.success) throw new ApiError("invalid_input", "Requête de vérification invalide.");
    const { paymentId, outcome } = body.data;

    let payment = await db.signupPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new ApiError("not_found", "Paiement introuvable.", 404);

    // Déjà activé : renvoyer le même accusé (idempotence totale).
    if (payment.status === "approved" && payment.structureId) {
      res.json(activationPayload(payment.id, payment.structureId, null));
      return;
    }
    if (payment.status === "declined") {
      res.json({ status: "declined", activated: false, message: "Paiement refusé. Reprends l'inscription." });
      return;
    }

    // Statut réel : FedaPay si configuré, sinon décision explicite du mode test.
    let approved = false;
    let failure: string | null = null;
    if (fedapayConfigured() && payment.providerRef) {
      try {
        const tx = await fedapayGetTransaction(payment.providerRef);
        approved = tx.status === "approved";
        if (!approved && (tx.status === "declined" || tx.status === "canceled")) {
          failure = "Paiement refusé ou annulé sur la page FedaPay.";
        }
      } catch (err) {
        // API injoignable : on reste « pending », le front réessaie.
        throw new ApiError(
          "payment_check_retry",
          "Vérification impossible pour l'instant. Nouvelle tentative dans quelques secondes…",
          503,
        );
      }
    } else {
      if (!fedapayTestMode()) {
        throw new ApiError("payment_unconfigured", "Paiement en ligne non configuré.", 503);
      }
      if (!outcome) {
        res.json({ status: "pending", activated: false, mode: "test" });
        return;
      }
      approved = outcome === "approved";
      if (!approved) failure = "Paiement annulé (mode test).";
    }

    if (!approved) {
      await db.signupPayment.update({
        where: { id: payment.id },
        data: { status: "declined", error: failure },
      });
      res.json({ status: "declined", activated: false, message: failure ?? "Paiement non abouti." });
      return;
    }

    // ── Activation : structure ACTIVE + dirigeant + abonnement + facture ──
    const draft = draftOf(payment);
    const periodMonths = payment.billingPeriod === "yearly" ? 12 : 1;
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + periodMonths);

    const structure = await db.structure.create({
      data: {
        name: draft.structureName,
        kind: draft.kind,
        licenseRef: draft.licenseRef ?? null,
        city: draft.city ?? null,
        status: "active", // le paiement tient lieu de vérification initiale
      },
    });
    const owner = await db.user.create({
      data: {
        tenantId: structure.id,
        phone: draft.ownerPhone,
        fullName: draft.ownerName,
        role: "owner",
        pinHash: draft.pinHash,
      },
    });
    await db.subscription.create({
      data: {
        tenantId: structure.id,
        plan: payment.plan,
        status: "active",
        periodStart: now,
        periodEnd,
      },
    });
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await db.invoice.create({
      data: {
        tenantId: structure.id,
        period,
        baseAmount: payment.amount,
        extras: JSON.stringify({ billingPeriod: payment.billingPeriod, plan: payment.plan }),
        total: payment.amount,
        status: "paid",
        paidAt: now,
      },
    });

    payment = await db.signupPayment.update({
      where: { id: payment.id },
      data: { status: "approved", paidAt: now, structureId: structure.id },
    });

    // Entrée d'audit d'origine : la chaîne scellée de la structure commence
    // ici (activation self-service après paiement confirmé).
    await appendAudit({
      tenantId: structure.id,
      actorId: owner.id,
      action: "structure_activated",
      entity: "structure",
      entityId: structure.id,
      payload: { name: structure.name, plan: payment.plan, billingPeriod: payment.billingPeriod, amount: payment.amount, selfService: true },
    });

    // Session ouverte immédiatement : « Ouvrir mon espace » sans ressaisir le PIN.
    const token = await createSession(owner.id);
    setSessionCookie(res, token);
    res.json(activationPayload(payment.id, structure.id, token));
  })
);

interface SignupDraft {
  structureName: string;
  kind: string;
  licenseRef: string | null;
  city: string;
  ownerName: string;
  ownerPhone: string;
  pinHash: string;
}

function draftOf(payment: { draft: string }): SignupDraft {
  try {
    return JSON.parse(payment.draft) as SignupDraft;
  } catch {
    throw new ApiError("draft_corrupt", "Les données d'inscription sont illisibles. Reprends l'inscription.", 500);
  }
}

function activationPayload(paymentId: string, structureId: string, token: string | null) {
  return {
    status: "approved",
    activated: true,
    paymentId,
    structureId,
    token,
    message: "Paiement confirmé. Ton espace est créé et actif.",
  };
}

// Nettoyage : les intentions de paiement abandonnées depuis plus de 24 h expirent
// (pas de cron nécessaire — exécuté au passage sur /register).
router.post(
  "/register/cleanup",
  h(async (_req, res) => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db.signupPayment.updateMany({
      where: { status: "pending", createdAt: { lt: yesterday }, structureId: null },
      data: { status: "expired" },
    });
    res.json({ ok: true, expired: result.count });
  })
);

export default router;
