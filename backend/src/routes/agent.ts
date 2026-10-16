// TontiHelm — routes agent : tournée du jour, synchronisation des encaissements,
// déclaration de caisse, carnet détaillé d'un arrêt de tournée.
import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { requireUser, requireRole, requireTenant, errorResponse, ApiError, h } from "../lib/auth";
import { appendAudit } from "../lib/audit";
import { assertWritable } from "../lib/tenant";
import { passbookBalance, paidDays, missedDays, elapsedDays, isLate, closingGap, formatFCFA } from "../lib/domain";
import { receiptSms } from "../lib/sms";

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
const eventSchema = z.object({
  id: z.string().uuid("Identifiant d'événement invalide."),
  passbookId: z.string().min(1),
  amount: z.number().int().refine((n) => n !== 0, "Montant invalide."),
  method: z.enum(["cash", "mobile_money"]),
  advance: z.boolean().optional().default(false),
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

    const structure = await db.structure.findUnique({ where: { id: tenantId } });
    if (!structure) throw new ApiError("not_found", "Structure introuvable.", 404);

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
      const dayIndex = Math.min(paidDays(balance + ev.amount, passbook.dailyAmount), passbook.cycleDays);
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
          advance: ev.advance,
          source: "sync",
        },
        at: new Date(),
      });

      // Reçu immédiat par SMS au cotisant (§13.5, sans accents).
      if (ev.amount > 0 && passbook.contributor.phone) {
        await db.notification.create({
          data: {
            tenantId,
            channel: "sms",
            template: "receipt",
            toPhone: passbook.contributor.phone,
            content: receiptSms({
              structure: structure.name,
              amount: ev.amount,
              date: collectedAt,
              passbookNumber: passbook.number,
              dayIndex,
              cycleDays: passbook.cycleDays,
              balance: newBalance,
            }),
            status: "sent",
            costFcfa: 25,
          },
        });
      }

      acks.push({ id: ev.id, status: "created", collectionId: ev.id });
    }

    res.json({ acks });
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
