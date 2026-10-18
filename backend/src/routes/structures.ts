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
import { flipOverdueSubscriptions } from "../lib/tenant";
import { PLANS } from "../lib/plans";
import { ensureStructureSlug, entityUrl } from "../lib/share";
import {
  fedapayConfigured,
  fedapayTestMode,
  fedapayCreateTransaction,
  fedapayGetTransaction,
  fedapayPaymentPageUrl,
  fedapayEnvironment,
  fedapayKeysCoherent,
  FedaPayApiError,
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
// Patron Academia Helm : le backend crée la transaction côté serveur (clé
// secrète) et renvoie le LIEN DE PAIEMENT HÉBERGÉ (page pleine page FedaPay,
// obtenue par POST /v1/transactions/:id/token). Le front redirige vers ce
// lien ; le widget intégré ne sert que de repli — dans ce repli il ne reçoit
// QUE amount + description (+ client), JAMAIS d'identifiant : l'iframe crée
// alors sa propre transaction et le navigateur en rapporte l'identifiant au
// moment de la vérification (jamais cru : le statut vient toujours de l'API).
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

    // Clés publiques et secrètes d'environnements différents (pk_live + sk_sandbox
    // ou l'inverse) : la transaction serait créée dans un environnement invisible
    // du widget (« Transaction non trouvée »). On refuse clairement l'amorçage.
    if (!fedapayKeysCoherent()) {
      throw new ApiError(
        "payment_env_mismatch",
        "Les clés FedaPay publiques et secrètes ne sont pas du même environnement (live/sandbox). Vérifie la configuration FEDAPAY_PUBLIC_KEY et FEDAPAY_SECRET_KEY.",
        503,
      );
    }

    const draft = draftOf(payment);
    const description = `Abonnement TontiHelm ${PLANS[payment.plan].label} — ${draft.structureName}`;

    // Une transaction FedaPay existe-t-elle déjà ? (retour en arrière, double-clic)
    // ⚠ Les enregistrements créés avant le correctif de l'enveloppe v1 peuvent
    // porter un providerRef « undefined » : on le considère comme absent.
    const usableRef = payment.providerRef && payment.providerRef !== "undefined" ? payment.providerRef : null;
    let transactionId = usableRef;
    let paymentUrl: string | null = null;

    if (!transactionId) {
      const callbackUrl = `${frontendBaseUrl()}/inscription?paymentId=${payment.id}&status=return`;
      try {
        const tx = await fedapayCreateTransaction({
          amount: payment.amount,
          description,
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
        transactionId = tx.transactionId;
        paymentUrl = tx.paymentUrl;
      } catch (err) {
        // FedaPay injoignable ou configuration refusée : on ne bloque pas le
        // formulaire, on renvoie l'erreur réelle pour affichage.
        throw new ApiError(
          "payment_provider_error",
          err instanceof Error ? err.message : "FedaPay est momentanément injoignable. Réessaie dans un instant.",
          502,
        );
      }
    }

    // Lien hébergé toujours régénéré (jeton frais, valable même pour une
    // transaction réutilisée) — patron Academia Helm « page pleine page ».
    if (transactionId) {
      paymentUrl = paymentUrl ?? (await fedapayPaymentPageUrl(transactionId));
      if (usableRef !== transactionId) {
        await db.signupPayment.update({
          where: { id: payment.id },
          data: { providerRef: transactionId },
        });
      }
    }

    res.json({
      ok: true,
      mode: "fedapay",
      paymentId: payment.id,
      amount: payment.amount,
      transactionId,
      paymentUrl,
      // Repli widget intégré (uniquement si paymentUrl indisponible) :
      // amount + description SANS id — l'iframe crée sa propre transaction.
      checkout: {
        public_key: process.env.FEDAPAY_PUBLIC_KEY,
        environment: fedapayEnvironment(),
        transaction: { amount: payment.amount, description },
        customer: { lastname: draft.ownerName ?? "", phone_number: draft.ownerPhone ?? "" },
      },
    });
  })
);

// ── 3. Vérification du statut réel + activation idempotente ──────────────────
router.post(
  "/register/verify",
  h(async (req, res) => {
    const schema = z.object({
      paymentId: z.string().min(1),
      outcome: z.enum(["approved", "declined"]).optional(), // mode test uniquement
      // Identifiant DE TRANSACTION rapporté par le widget intégré (repli sans
      // page hébergée) : l'iframe crée lui-même la transaction, le navigateur
      // en rapporte l'id. ⚠ On ne croit JAMAIS le statut annoncé : on ne garde
      // que l'id comme clé de recherche, le statut vient toujours de l'API.
      fedapayTransactionId: z.string().min(1).optional(),
    });
    const body = schema.safeParse(req.body ?? {});
    if (!body.success) throw new ApiError("invalid_input", "Requête de vérification invalide.");
    const { paymentId, outcome, fedapayTransactionId } = body.data;

    let payment = await db.signupPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new ApiError("not_found", "Paiement introuvable.", 404);

    // Déjà activé : renvoyer le même accusé (idempotence totale).
    if (payment.status === "approved" && payment.structureId) {
      res.json(activationPayload(payment, null));
      return;
    }
    if (payment.status === "declined") {
      res.json({ status: "declined", activated: false, message: "Paiement refusé. Reprends l'inscription." });
      return;
    }

    // Statut réel : FedaPay si configuré, sinon décision explicite du mode test.
    let approved = false;
    let failure: string | null = null;
    let verifiedAmount: number | null = null;
    let definitive = false; // refus définitif (declined/canceled) — à distinguer de « pas encore payé »
    // ⚠ providerRef « undefined » = enregistrement antérieur au correctif de
    // l'enveloppe v1 : on le considère comme absent et on retombe (le cas
    // échéant) sur l'identifiant rapporté par le widget.
    const providerRef =
      payment.providerRef && payment.providerRef !== "undefined" ? payment.providerRef : null;
    const lookupId = providerRef ?? fedapayTransactionId ?? null;

    if (fedapayConfigured() && lookupId) {
      try {
        const tx = await fedapayGetTransaction(lookupId);
        verifiedAmount = tx.amount;
        approved = tx.status === "approved";
        if (approved && verifiedAmount !== null && verifiedAmount !== payment.amount) {
          // Le montant payé doit être exactement celui fixé côté serveur :
          // on refuse une transaction approuvée d'un autre montant.
          approved = false;
          failure = `Le montant payé (${verifiedAmount} FCFA) ne correspond pas à l'abonnement (${payment.amount} FCFA). Reprends l'inscription.`;
          definitive = true;
        }
        if (!approved && !failure && (tx.status === "declined" || tx.status === "canceled")) {
          failure = "Paiement refusé ou annulé sur la page FedaPay.";
          definitive = true;
        }
        // Le widget intégré a payé SA transaction : on la mémorise comme
        // référence du paiement pour les vérifications suivantes.
        if (!providerRef && fedapayTransactionId && lookupId === fedapayTransactionId) {
          await db.signupPayment.update({
            where: { id: payment.id },
            data: { providerRef: fedapayTransactionId },
          });
        }
      } catch (err) {
        // 404 FedaPay = transaction définitivement introuvable (identifiant
        // invalide) : on NE BOUCLE PLUS (bug historique « vérification en
        // boucle »). Seules les pannes réseau/5xx restent réessayables.
        if (err instanceof FedaPayApiError && err.httpStatus === 404) {
          throw new ApiError(
            "transaction_not_found",
            "La transaction FedaPay est introuvable. Le paiement n'a pas pu être rattaché — reprends l'inscription et paie à nouveau.",
            422,
          );
        }
        throw new ApiError(
          "payment_check_retry",
          "Vérification impossible pour l'instant. Nouvelle tentative dans quelques secondes…",
          503,
        );
      }
    } else if (fedapayConfigured() && !lookupId) {
      // Le paiement n'a pas encore été amorcé côté FedaPay (retour prématuré
      // sur la page d'inscription, par exemple) : reste « pending », borné côté front.
      res.json({ status: "pending", activated: false, message: "Paiement pas encore amorcé." });
      return;
    } else {
      if (!fedapayTestMode()) {
        throw new ApiError("payment_unconfigured", "Paiement en ligne non configuré.", 503);
      }
      if (!outcome) {
        res.json({ status: "pending", activated: false, mode: "test" });
        return;
      }
      approved = outcome === "approved";
      if (!approved) {
        failure = "Paiement annulé (mode test).";
        definitive = true;
      }
    }

    if (!approved && !definitive) {
      // ⚠ Transaction encore PENDING (l'utilisateur n'a pas encore payé, ou
      // FedaPay n'a pas encore tranché) : on reste « pending » SANS marquer le
      // paiement refusé — un verify prématuré ne doit jamais tuer l'inscription
      // (bug du 17/10 : la moindre vérification anticipée verrouillait le
      // paiement en « refusé » et imposait de tout recommencer).
      res.json({
        status: "pending",
        activated: false,
        message: "Paiement pas encore confirmé par FedaPay.",
      });
      return;
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
    // Lien dédié de l'entité : généré dès l'activation (portail /e/{slug} propre
    // à la structure — ses agents, ses gérants et les liens de carnet de ses clients).
    const structureSlug = await ensureStructureSlug(structure.id);
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
    res.json(activationPayload(payment, token, structureSlug));
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

function activationPayload(
  payment: { id: string; structureId: string | null; plan: string; amount: number; billingPeriod: string; draft: string },
  token: string | null,
  structureSlug?: string,
) {
  // structureName/ownerPhone resservent l'écran de succès APRÈS le retour de
  // la page hébergée FedaPay (rechargement complet → formulaire vide).
  const draft = safeDraftOf(payment);
  return {
    status: "approved",
    activated: true,
    paymentId: payment.id,
    structureId: payment.structureId,
    token,
    structureName: draft?.structureName ?? "Ta structure",
    ownerPhone: draft?.ownerPhone ?? "",
    plan: payment.plan,
    billingPeriod: payment.billingPeriod,
    amount: payment.amount,
    entityUrl: structureSlug ? entityUrl(structureSlug) : null,
    message: "Paiement confirmé. Ton espace est créé et actif.",
  };
}

function safeDraftOf(payment: { draft: string }): SignupDraft | null {
  try {
    return JSON.parse(payment.draft) as SignupDraft;
  } catch {
    return null;
  }
}

// Nettoyage : les intentions de paiement abandonnées depuis plus de 24 h expirent
// (pas de cron nécessaire — exécuté au passage sur /register). La même passe
// fait la bascule quotidienne past_due → read_only (§8.12) : 15 jours d'impayé
// après la fin de période, journalisée au plus une fois par structure.
router.post(
  "/register/cleanup",
  h(async (_req, res) => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db.signupPayment.updateMany({
      where: { status: "pending", createdAt: { lt: yesterday }, structureId: null },
      data: { status: "expired" },
    });
    const flipped = await flipOverdueSubscriptions();
    res.json({ ok: true, expired: result.count, readOnlyFlipped: flipped });
  })
);

export default router;
