// TontiHelm — routes agent : tournée du jour, synchronisation des encaissements,
// déclaration de caisse, clients du portefeuille (création sur le terrain + lien
// de carnet partagé par WhatsApp / e-mail), carnets multiples par client.
// Le carnet est un LIVRET ANNUEL : 12 feuilles mensuelles (31 lignes chacune,
// la 31e = mise de l'entreprise) + 13e feuille de récapitulatif. Les écritures
// remplissent les lignes séquentiellement — l'avance couvre des lignes à venir.
import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { requireUser, requireRole, requireTenant, ApiError, h } from "../lib/auth";
import { appendAudit } from "../lib/audit";
import { assertWritable } from "../lib/tenant";
import { planOf } from "../lib/plans";
import { closingGap, formatFCFA } from "../lib/domain";
import { LIVRET_DAYS, monthStart, sheetsForCycleDays } from "../lib/livret";
import { livretStop } from "../lib/tour";
import { applyCollectionEvent } from "../lib/sync-engine";
import { ensureShareToken, ensureStructureSlug, carnetUrl, entityUrl } from "../lib/share";
import { autoScale } from "../lib/autoscale";

const router = Router();

// Phase 1 (PARITE.md §8.2) : la fenêtre encaissable et la sérialisation d'arrêt
// vivent dans lib/tour.ts, le cœur d'application d'un événement dans
// lib/sync-engine.ts — partagés avec /v1/sync/* (mobile). Ce routeur web garde
// EXACTEMENT le même comportement : mêmes réponses, mêmes erreurs HTTP de lot.

// ── GET /api/agent/tour — tournée du jour (§14.7 snapshot local). ──
router.get(
  "/tour",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["agent"]);
    const tenantId = requireTenant(user);

    const structure = await db.structure.findUnique({ where: { id: tenantId } });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const passbooks = await db.passbook.findMany({
      where: { tenantId, agentId: user.id, status: { in: ["active", "late"] } },
      include: {
        contributor: true,
        collections: { orderBy: { collectedAt: "asc" } },
      },
    });

    const stops = passbooks
      .map((pb) => {
        const stop = livretStop(pb, pb.collections, structure?.lateThreshold ?? 3);
        const todayCollections = pb.collections.filter(
          (c) => c.amount > 0 && c.collectedAt >= todayStart && c.collectedAt < todayEnd
        );
        return {
          contributorId: pb.contributorId,
          contributorName: pb.contributor.fullName,
          phone: pb.contributor.phone,
          neighborhood: pb.contributor.neighborhood ?? "",
          ...stop,
          collectedToday: todayCollections.length
            ? {
                count: todayCollections.length,
                amount: todayCollections.reduce((s, c) => s + c.amount, 0),
                method: todayCollections[todayCollections.length - 1].method,
                at: todayCollections[todayCollections.length - 1].collectedAt,
              }
            : null,
        };
      })
      .sort((a, b) => a.neighborhood.localeCompare(b.neighborhood, "fr") || a.contributorName.localeCompare(b.contributorName, "fr"));

    // Encaissements du jour en mobile money (hors caisse espèces) et espèces attendues.
    const todayAll = await db.collection.findMany({
      where: { tenantId, agentId: user.id, collectedAt: { gte: todayStart, lt: todayEnd } },
    });
    const expectedCash = todayAll.filter((c) => c.method === "cash").reduce((s, c) => s + c.amount, 0);
    const mobileToday = todayAll.filter((c) => c.method === "mobile_money").reduce((s, c) => s + c.amount, 0);

    const closing = await db.closing.findFirst({
      where: { tenantId, agentId: user.id, day: todayStart },
    });

    const neighborhoods = [...new Set(stops.map((s) => s.neighborhood))].sort((a, b) =>
      a.localeCompare(b, "fr")
    );

    res.json({
      date: todayStart.toISOString(),
      structure: { name: structure?.name ?? "", lateThreshold: structure?.lateThreshold ?? 3 },
      agent: { name: user.fullName, phone: user.phone },
      neighborhoods,
      stops,
      summary: {
        totalStops: stops.length,
        collected: stops.filter((s) => s.collectedToday).length,
        remaining: stops.filter((s) => !s.collectedToday).length,
        expectedCash,
        mobileToday,
      },
      closing: closing
        ? {
            id: closing.id,
            status: closing.status,
            declaredCash: closing.declaredCash,
            expectedCash: closing.expectedCash,
            gap: closing.gap,
          }
        : null,
    });
  })
);

// ── POST /api/agent/sync — envoi d'un lot d'encaissements, réponse idempotente (§14.7). ──
// Chaque écriture couvre la prochaine ligne du livret (remplissage séquentiel,
// comme le marquage du carnet papier) ; le montant peut couvrir plusieurs lignes
// d'un coup (avance). Les anciens événements datés (coversOn) restent admis.
const eventSchema = z.object({
  id: z.string().uuid("Identifiant d'événement invalide."),
  passbookId: z.string().min(1),
  amount: z.number().int().refine((n) => n !== 0, "Montant invalide."),
  method: z.enum(["cash", "mobile_money"]),
  advance: z.boolean().optional().default(false),
  coversOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Journée couverte invalide (format AAAA-MM-JJ attendu).")
    .optional()
    .nullable(),
  collectedAt: z.string().datetime({ offset: true }),
});

const syncSchema = z.object({
  events: z.array(eventSchema).max(50, "Lot trop volumineux (50 maximum)."),
});

router.post(
  "/sync",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["agent"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const body = syncSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Lot invalide.";
      throw new ApiError("invalid_input", issue);
    }

    // Une clôture validée verrouille les encaissements de la journée (règle métier 5).
    // Garde de LOT conservée à l'identique pour le web (PARITE.md écart n° 3) ;
    // le canal /v1 applique la même règle par événement, sur la journée couverte.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const validatedClosing = await db.closing.findFirst({
      where: { tenantId, agentId: user.id, day: todayStart, status: "validated" },
    });
    if (validatedClosing) {
      throw new ApiError(
        "day_locked",
        "Clôture validée. Les encaissements du jour sont verrouillés.",
        409
      );
    }

    const acks: { id: string; status: "created" | "duplicate"; collectionId: string }[] = [];

    for (const ev of body.data.events) {
      // Moteur partagé (lib/sync-engine.ts) — le rejet métier continue de faire
      // échouer le lot en HTTP sur CE canal web, à l'identique d'avant l'extraction.
      acks.push(await applyCollectionEvent({ tenantId, agentId: user.id, ev, source: "sync" }));
    }

    res.json({ acks });
  })
);

// ── GET /api/agent/clients — portefeuille clients de l'agent, avec TOUS leurs carnets. ──
// Un client peut prendre plusieurs livrets (chacun avec son surnom) : ils sont
// regroupés sous ce client — on clique le client, puis le carnet à encaisser.
router.get(
  "/clients",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["agent"]);
    const tenantId = requireTenant(user);

    const [structure, contributors] = await Promise.all([
      db.structure.findUnique({ where: { id: tenantId }, select: { id: true, name: true, lateThreshold: true } }),
      db.contributor.findMany({
        where: { agentId: user.id },
        orderBy: { createdAt: "desc" },
        include: {
          passbooks: {
            where: { status: { in: ["active", "late", "closing", "completed", "closed"] } },
            include: { collections: true },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
    ]);
    const slug = await ensureStructureSlug(tenantId);
    const lateThreshold = structure?.lateThreshold ?? 3;

    const clients = contributors.map((c) => {
      const carnets = c.passbooks.map((pb) => {
        const stop = livretStop(pb, pb.collections, lateThreshold);
        return {
          id: pb.id,
          number: pb.number,
          label: pb.label,
          status: stop.status,
          statusLabel: stop.statusLabel,
          dailyAmount: pb.dailyAmount,
          balance: stop.balance,
          livret: stop.livret,
        };
      });
      return {
        id: c.id,
        fullName: c.fullName,
        phone: c.phone,
        email: c.email,
        neighborhood: c.neighborhood,
        shareToken: c.shareToken,
        shareUrl: c.shareToken ? carnetUrl(slug, c.shareToken) : null,
        status: c.status,
        carnets,
      };
    });

    res.json({ clients, entity: { name: structure?.name ?? "", url: entityUrl(slug) } });
  })
);

// ── POST /api/agent/clients — nouveau client + premier livret, en une fois (fluide). ──
// Sur le terrain, l'agent enregistre le client et sa tontine : la mise journalière
// suffit — le livret annuel démarre AUTOMATIQUEMENT au mois en cours (12 feuilles
// mensuelles + récap). Le surnom du carnet est facultatif. Le lien personnel est
// généré immédiatement, prêt à partager par WhatsApp ou e-mail.
const cycleDaysField = z
  .number()
  .int()
  .min(1, "La durée minimum d'un cycle est de 1 jour.")
  .max(372, "La durée maximum d'un cycle est de 372 jours (livret annuel).")
  .optional();

const createClientSchema = z.object({
  fullName: z.string().min(2, "Saisis le nom complet du client."),
  phone: z.string().regex(/^\+?\d{8,15}$/, "Numéro invalide. Saisis le numéro complet, sans espace."),
  email: z.string().email("Adresse e-mail invalide.").optional().or(z.literal("")),
  neighborhood: z.string().min(2, "Saisis le quartier."),
  idNumber: z.string().min(3, "Saisis le numéro de pièce d'identité.").optional().or(z.literal("")),
  dailyAmount: z.number().int().min(100, "La mise journalière minimum est de 100 FCFA."),
  label: z.string().max(60, "Le surnom du carnet est trop long.").optional().or(z.literal("")),
  // Durée du cycle optionnelle (§8.14) : défaut 372 (livret annuel).
  cycleDays: cycleDaysField,
});

router.post(
  "/clients",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["agent"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const body = createClientSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Formulaire incomplet.";
      throw new ApiError("invalid_input", issue);
    }

    // ── Montée en charge automatique : la création projette +1 cotisant ; si le
    // palier courant ne suffit plus, le système scale tout seul (alerte aux
    // dirigeants) et la création continue sans interruption. ──
    const scale = await autoScale(tenantId, { extraContributors: 1, actorId: user.id });
    const contributorsCount = scale.snapshot.contributors;
    const plan = planOf(scale.snapshot.plan);
    if (contributorsCount >= plan.contributors) {
      throw new ApiError(
        "contributor_quota_reached",
        `Le palier ${plan.label} inclut ${plan.contributors} cotisants et tu les as tous atteints : ` +
          `c'est le palier maximum. Contacte le support TontiHelm pour un accompagnement sur mesure.`,
        403
      );
    }

    // Livret à durée paramétrable (§8.14) : démarre au mois en cours, détecté
    // automatiquement. Défaut 372 (livret annuel complet).
    const startsOn = monthStart(new Date());
    const cycleDays = body.data.cycleDays ?? LIVRET_DAYS;

    // Numéro de carnet : séquence tenant, partagée avec le back-office.
    const last = await db.passbook.findFirst({ where: { tenantId }, orderBy: { number: "desc" } });
    const nextNumber = String((last ? parseInt(last.number, 10) : 100) + 1).padStart(4, "0");

    const contributor = await db.contributor.create({
      data: {
        tenantId,
        fullName: body.data.fullName,
        phone: body.data.phone,
        email: body.data.email || null,
        neighborhood: body.data.neighborhood,
        idNumber: body.data.idNumber || null,
        agentId: user.id,
        shareToken: null,
      },
    });
    const passbook = await db.passbook.create({
      data: {
        tenantId,
        contributorId: contributor.id,
        agentId: user.id,
        number: nextNumber,
        dailyAmount: body.data.dailyAmount,
        cycleDays,
        startsOn,
        label: body.data.label || null,
      },
    });

    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "contributor_created",
      entity: "contributor",
      entityId: contributor.id,
      payload: {
        fullName: contributor.fullName,
        neighborhood: contributor.neighborhood,
        agent: user.fullName,
        source: "terrain",
      },
    });
    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "passbook_created",
      entity: "passbook",
      entityId: passbook.id,
      payload: {
        number: nextNumber,
        label: passbook.label,
        contributor: contributor.fullName,
        dailyAmount: body.data.dailyAmount,
        cycleDays,
        months: sheetsForCycleDays(cycleDays),
        startsOn: startsOn.toISOString().slice(0, 10),
        source: "terrain",
      },
    });

    const url = await ensureShareToken(contributor.id);
    res.status(201).json({
      contributor: { id: contributor.id, fullName: contributor.fullName },
      passbook: { id: passbook.id, number: nextNumber, label: passbook.label },
      shareUrl: url,
      autoUpgrade: scale.upgraded
        ? { from: scale.fromPlan, to: scale.toPlan }
        : null,
    });
  })
);

// ── POST /api/agent/clients/:id/carnets — un NOUVEAU livret pour un client existant. ──
// Le client peut prendre plusieurs carnets ( boutique, école, projet…) : chacun
// garde son numéro et son surnom, tous regroupés sous le même client.
const createCarnetSchema = z.object({
  dailyAmount: z.number().int().min(100, "La mise journalière minimum est de 100 FCFA."),
  label: z.string().max(60, "Le surnom du carnet est trop long.").optional().or(z.literal("")),
  // Durée du cycle optionnelle (§8.14) : défaut 372 (livret annuel).
  cycleDays: cycleDaysField,
});

router.post(
  "/clients/:id/carnets",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["agent"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const body = createCarnetSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Formulaire incomplet.";
      throw new ApiError("invalid_input", issue);
    }

    const contributor = await db.contributor.findUnique({ where: { id: req.params.id } });
    if (!contributor || contributor.tenantId !== tenantId || contributor.agentId !== user.id) {
      throw new ApiError("not_found", "Client introuvable dans ton portefeuille.", 404);
    }

    const last = await db.passbook.findFirst({ where: { tenantId }, orderBy: { number: "desc" } });
    const nextNumber = String((last ? parseInt(last.number, 10) : 100) + 1).padStart(4, "0");
    const startsOn = monthStart(new Date());
    const cycleDays = body.data.cycleDays ?? LIVRET_DAYS;

    const passbook = await db.passbook.create({
      data: {
        tenantId,
        contributorId: contributor.id,
        agentId: user.id,
        number: nextNumber,
        dailyAmount: body.data.dailyAmount,
        cycleDays,
        startsOn,
        label: body.data.label || null,
      },
    });
    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "passbook_created",
      entity: "passbook",
      entityId: passbook.id,
      payload: {
        number: nextNumber,
        label: passbook.label,
        contributor: contributor.fullName,
        dailyAmount: body.data.dailyAmount,
        cycleDays,
        months: sheetsForCycleDays(cycleDays),
        startsOn: startsOn.toISOString().slice(0, 10),
        source: "terrain",
        additional: true,
      },
    });

    res.status(201).json({
      passbook: { id: passbook.id, number: nextNumber, label: passbook.label },
    });
  })
);

// ── POST /api/agent/clients/:id/share — (re)génère le lien de carnet d'un client. ──
router.post(
  "/clients/:id/share",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["agent"]);
    const tenantId = requireTenant(user);

    const contributor = await db.contributor.findUnique({ where: { id: req.params.id } });
    if (!contributor || contributor.tenantId !== tenantId || contributor.agentId !== user.id) {
      throw new ApiError("not_found", "Client introuvable dans ton portefeuille.", 404);
    }
    const url = await ensureShareToken(contributor.id);
    res.json({ url });
  })
);

// ── POST /api/agent/closing — déclaration de caisse en fin de tournée (M5). ──
const closingSchema = z.object({
  declaredCash: z.number().int().min(0, "Montant invalide."),
});

router.post(
  "/closing",
  h(async (req, res) => {
    const user = await requireUser(req);
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

    // Espèces attendues : somme des encaissements en espèces du jour, hors mobile money.
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
      payload: { day: todayStart.toISOString().slice(0, 10), declaredCash: body.data.declaredCash, expectedCash, gap },
    });

    const message =
      gap === 0
        ? "Déclaration enregistrée. Aucun écart avec tes encaissements."
        : `Écart de ${formatFCFA(Math.abs(gap))} entre ta déclaration et tes encaissements. Vérifie la tournée avant de valider.`;

    res.json({
      closing: { id: closing.id, declaredCash: body.data.declaredCash, expectedCash, gap, status: "declared" },
      message,
    });
  })
);

export default router;
