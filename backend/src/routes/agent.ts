// TontiHelm — routes agent : tournée du jour, synchronisation des encaissements,
// déclaration de caisse, clients du portefeuille (création sur le terrain + lien
// de carnet partagé par WhatsApp / e-mail), carnet détaillé d'un arrêt de tournée.
import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { requireUser, requireRole, requireTenant, errorResponse, ApiError, h } from "../lib/auth";
import { appendAudit } from "../lib/audit";
import { assertWritable, getSubscription } from "../lib/tenant";
import { planOf } from "../lib/plans";
import { passbookBalance, paidDays, missedDays, elapsedDays, isLate, closingGap, formatFCFA, buildDayLedger } from "../lib/domain";
import { ensureShareToken, carnetUrl } from "../lib/share";

const router = Router();

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
        const balance = passbookBalance(pb.collections);
        const elapsed = Math.min(elapsedDays(pb, new Date()), pb.cycleDays);
        const paid = paidDays(balance, pb.dailyAmount);
        const missed = missedDays(pb, balance);
        const todayCollections = pb.collections.filter(
          (c) => c.amount > 0 && c.collectedAt >= todayStart && c.collectedAt < todayEnd
        );
        const late = isLate(pb, balance, structure?.lateThreshold ?? 3);
        // Registre des journées du cycle (multi-jours) : le sélecteur de
        // journées de l'écran d'encaissement s'appuie dessus.
        const ledger = buildDayLedger(
          pb,
          pb.collections.map((c) => ({
            id: c.id,
            amount: c.amount,
            coversOn: c.coversOn,
            collectedAt: c.collectedAt,
            reversesId: c.reversesId,
          }))
        );
        return {
          contributorId: pb.contributorId,
          contributorName: pb.contributor.fullName,
          phone: pb.contributor.phone,
          neighborhood: pb.contributor.neighborhood ?? "",
          passbookId: pb.id,
          passbookNumber: pb.number,
          dailyAmount: pb.dailyAmount,
          cycleDays: pb.cycleDays,
          startsOn: pb.startsOn,
          days: ledger.map((d) => ({ date: d.date.toISOString().slice(0, 10), net: d.net })),
          dayIndex: Math.max(1, Math.min(elapsed + (paid > elapsed ? 1 : 0), pb.cycleDays)),
          paidDays: paid,
          missedDays: missed,
          balance,
          status: late ? "late" : pb.status,
          statusLabel: late ? "En retard" : pb.status === "active" ? "À jour" : "Clos",
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
// Chaque événement peut couvrir une journée précise du cycle (coversOn, multi-jours) :
// aujourd'hui, demain, après-demain… sans limite autre que les bornes du cycle.
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
      const existing = await db.collection.findUnique({ where: { id: ev.id } });
      if (existing) {
        acks.push({ id: ev.id, status: "duplicate", collectionId: existing.id });
        continue;
      }
      const passbook = await db.passbook.findUnique({
        where: { id: ev.passbookId },
        include: { contributor: true, collections: true },
      });
      if (!passbook || passbook.tenantId !== tenantId || passbook.agentId !== user.id) {
        acks.push({ id: ev.id, status: "duplicate", collectionId: ev.id });
        continue;
      }
      // Journée couverte : elle doit tomber dans le cycle réel du carnet.
      let coversOn: Date | null = null;
      let coversIdx = -1;
      if (ev.coversOn) {
        coversOn = new Date(`${ev.coversOn}T00:00:00.000Z`);
        if (Number.isNaN(coversOn.getTime())) {
          throw new ApiError("invalid_input", "Journée couverte invalide.");
        }
        const startMs = Date.UTC(
          passbook.startsOn.getUTCFullYear(),
          passbook.startsOn.getUTCMonth(),
          passbook.startsOn.getUTCDate()
        );
        coversIdx = Math.round((coversOn.getTime() - startMs) / (24 * 60 * 60 * 1000));
        if (coversIdx < 0 || coversIdx >= passbook.cycleDays) {
          throw new ApiError(
            "day_out_of_cycle",
            "Cette journée est hors du cycle du carnet.",
            422
          );
        }
      }
      // Règle métier 2 : un encaissement ne dépasse jamais le montant restant du cycle,
      // sauf paiement d'avance explicitement marqué.
      const cycleTotal = passbook.dailyAmount * passbook.cycleDays;
      const balance = passbookBalance(passbook.collections);
      if (!ev.advance && ev.amount > cycleTotal - balance) {
        throw new ApiError(
          "amount_exceeds",
          "Encaissement supérieur au montant restant du cycle. Marque-le comme paiement d'avance ou corrige le montant.",
          422
        );
      }
      // Jour du cycle : celui de la journée couverte si elle est explicite,
      // sinon la position cumulative habituelle.
      const dayIndex = coversIdx >= 0
        ? coversIdx + 1
        : Math.min(paidDays(balance + ev.amount, passbook.dailyAmount), passbook.cycleDays);
      const collectedAt = new Date(ev.collectedAt);

      await db.collection.create({
        data: {
          id: ev.id,
          tenantId,
          passbookId: passbook.id,
          agentId: user.id,
          amount: ev.amount,
          method: ev.method,
          dayIndex,
          coversOn,
          collectedAt,
          receivedAt: new Date(),
        },
      });

      const newBalance = balance + ev.amount;
      await appendAudit({
        tenantId,
        actorId: user.id,
        action: "collection",
        entity: "collection",
        entityId: ev.id,
        payload: {
          passbook: passbook.number,
          contributor: passbook.contributor.fullName,
          amount: ev.amount,
          method: ev.method,
          dayIndex,
          coversOn: ev.coversOn ?? null,
          advance: ev.advance,
          source: "sync",
        },
        at: new Date(),
      });

      // Le carnet du cotisant est la source de vérité : chaque écriture y est
      // visible immédiatement depuis son lien personnel (WhatsApp / e-mail).

      acks.push({ id: ev.id, status: "created", collectionId: ev.id });
    }

    res.json({ acks });
  })
);

// ── GET /api/agent/clients — portefeuille clients de l'agent (avec lien de carnet). ──
router.get(
  "/clients",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["agent"]);
    const tenantId = requireTenant(user);

    const contributors = await db.contributor.findMany({
      where: { agentId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        passbooks: {
          where: { status: { in: ["active", "late"] } },
          include: { collections: true },
        },
      },
    });

    const clients = contributors.map((c) => {
      const pb = c.passbooks[0] ?? null;
      const balance = pb ? passbookBalance(pb.collections) : 0;
      return {
        id: c.id,
        fullName: c.fullName,
        phone: c.phone,
        email: c.email,
        neighborhood: c.neighborhood,
        shareToken: c.shareToken,
        shareUrl: c.shareToken ? carnetUrl(c.shareToken) : null,
        status: c.status,
        passbook: pb
          ? {
              id: pb.id,
              number: pb.number,
              dailyAmount: pb.dailyAmount,
              cycleDays: pb.cycleDays,
              balance,
              paidDays: paidDays(balance, pb.dailyAmount),
            }
          : null,
      };
    });

    res.json({ clients });
  })
);

// ── POST /api/agent/clients — nouveau client + premier carnet, en une fois (fluide). ──
// Sur le terrain, l'agent enregistre le client et sa tontine ; le lien personnel
// du carnet est généré immédiatement pour être partagé par WhatsApp ou e-mail.
const createClientSchema = z.object({
  fullName: z.string().min(2, "Saisis le nom complet du client."),
  phone: z.string().regex(/^\+?\d{8,15}$/, "Numéro invalide. Saisis le numéro complet, sans espace."),
  email: z.string().email("Adresse e-mail invalide.").optional().or(z.literal("")),
  neighborhood: z.string().min(2, "Saisis le quartier."),
  idNumber: z.string().min(3, "Saisis le numéro de pièce d'identité.").optional().or(z.literal("")),
  dailyAmount: z.number().int().min(100, "La mise journalière minimum est de 100 FCFA."),
  cycleDays: z.number().int().min(1, "Durée du cycle invalide.").max(366, "Durée du cycle invalide."),
  startsOn: z.string().min(8, "Date de début invalide."),
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

    // Quota de cotisants du palier courant.
    const sub = await getSubscription(tenantId);
    const plan = planOf(sub?.plan);
    const contributorsCount = await db.contributor.count({ where: { tenantId, status: "active" } });
    if (contributorsCount >= plan.contributors) {
      throw new ApiError(
        "contributor_quota_reached",
        `Le palier ${plan.label} inclut ${plan.contributors} cotisants. Passe au palier supérieur pour enregistrer d'autres clients.`,
        403
      );
    }

    const startsOn = new Date(`${body.data.startsOn}T00:00:00.000Z`);
    if (Number.isNaN(startsOn.getTime())) {
      throw new ApiError("invalid_input", "Date de début invalide.");
    }

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
        cycleDays: body.data.cycleDays,
        startsOn,
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
        contributor: contributor.fullName,
        dailyAmount: body.data.dailyAmount,
        cycleDays: body.data.cycleDays,
        startsOn: body.data.startsOn,
        source: "terrain",
      },
    });

    const url = await ensureShareToken(contributor.id);
    res.status(201).json({
      contributor: { id: contributor.id, fullName: contributor.fullName },
      passbook: { id: passbook.id, number: nextNumber },
      shareUrl: url,
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
