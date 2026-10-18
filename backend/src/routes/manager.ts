// TontiHelm — back-office gérant : tableau de bord, équipe, cotisants, carnets,
// carnet détaillé d'un cotisant (vue calendrier réel), encaissements, clôtures, audit, facturation.
import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "../lib/db";
import { requireUser, requireRole, requireTenant, errorResponse, ApiError, h } from "../lib/auth";
import { appendAudit, verifyAuditChain } from "../lib/audit";
import { assertWritable, getSubscription } from "../lib/tenant";
import { hashPin } from "../lib/auth";
import { passbookBalance, formatFCFA } from "../lib/domain";
import { planOf } from "../lib/plans";
import { ensureShareToken, ensureStructureSlug, carnetUrl, entityUrl, whatsappShareUrl } from "../lib/share";
import {
  LIVRET_DAYS, buildLivret, monthStart as livretMonthStart, serializeLivret, sheetsForCycleDays,
} from "../lib/livret";
import { autoScale, recentPlanEvents, markPlanEventsRead } from "../lib/autoscale";
import { parseDayParam } from "../lib/report";
import { publishTenantEvent } from "../lib/events";

const router = Router();

const DAY = 24 * 60 * 60 * 1000;

// ── GET /api/manager/dashboard — indicateurs du jour, de la semaine, du mois (M6). ──
router.get(
  "/dashboard",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);

    const structure = await db.structure.findUnique({ where: { id: tenantId } });
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart.getTime() - 6 * DAY);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const collections = await db.collection.findMany({
      where: { tenantId, collectedAt: { gte: monthStart } },
      include: {
        passbook: { include: { contributor: true } },
        agent: { select: { fullName: true } },
      },
      orderBy: { collectedAt: "desc" },
    });
    const monthTotal = collections.reduce((s, c) => s + c.amount, 0);
    const monthCount = collections.length;

    const todayColl = collections.filter((c) => c.collectedAt >= todayStart);
    const todayTotal = todayColl.reduce((s, c) => s + c.amount, 0);
    const weekColl = collections.filter((c) => c.collectedAt >= weekStart);
    const weekTotal = weekColl.reduce((s, c) => s + c.amount, 0);

    // Séries des 7 derniers jours.
    const dailySeries: { day: string; label: string; cash: number; mobile: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dStart = new Date(todayStart.getTime() - i * DAY);
      const dEnd = new Date(dStart.getTime() + DAY);
      const dayColl = collections.filter((c) => c.collectedAt >= dStart && c.collectedAt < dEnd);
      dailySeries.push({
        day: dStart.toISOString().slice(0, 10),
        label: dStart.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
        cash: dayColl.filter((c) => c.method === "cash").reduce((s, c) => s + c.amount, 0),
        mobile: dayColl.filter((c) => c.method === "mobile_money").reduce((s, c) => s + c.amount, 0),
      });
    }

    // Répartition du jour par agent et par quartier.
    const byAgent = new Map<string, number>();
    const byArea = new Map<string, number>();
    for (const c of todayColl) {
      const an = c.agent?.fullName ?? "—";
      byAgent.set(an, (byAgent.get(an) ?? 0) + c.amount);
      const ar = c.passbook?.contributor?.neighborhood ?? "—";
      byArea.set(ar, (byArea.get(ar) ?? 0) + c.amount);
    }

    // Carnets en retard, classés par lignes manquées (livret annuel).
    const passbooks = await db.passbook.findMany({
      where: { tenantId, status: { in: ["active", "late"] } },
      include: { contributor: true, collections: true, agent: { select: { fullName: true } } },
    });
    const latePassbooks = passbooks
      .map((pb) => {
        const balance = passbookBalance(pb.collections);
        const livret = buildLivret(pb, balance);
        return {
          passbookId: pb.id,
          number: pb.number,
          label: pb.label,
          contributor: pb.contributor.fullName,
          neighborhood: pb.contributor.neighborhood ?? "",
          dailyAmount: pb.dailyAmount,
          cycleDays: pb.cycleDays,
          startsOn: pb.startsOn,
          balance,
          paidDays: livret.coveredLines,
          missedDays: livret.missedLines,
          agent: pb.agent?.fullName ?? "—",
        };
      })
      .filter((p) => p.missedDays >= (structure?.lateThreshold ?? 3))
      .sort((a, b) => b.missedDays - a.missedDays);

    // Écarts de caisse non résolus.
    const unresolvedClosings = await db.closing.findMany({
      where: { tenantId, status: { in: ["declared", "disputed"] }, gap: { not: 0 } },
      include: { agent: { select: { fullName: true } } },
      orderBy: { day: "desc" },
    });

    // Activité récente (20 dernières écritures).
    const recent = collections.slice(0, 20).map((c) => ({
      id: c.id,
      at: c.collectedAt,
      amount: c.amount,
      method: c.method,
      contributor: c.passbook?.contributor?.fullName ?? "—",
      passbook: c.passbook?.number ?? "",
      agent: c.agent?.fullName ?? "—",
    }));

    const contributorsCount = await db.contributor.count({ where: { tenantId, status: "active" } });
    const activeThisMonth = new Set(collections.filter((c) => c.amount > 0).map((c) => c.passbook.contributorId)).size;

    // ── Montée en charge automatique + alertes dirigeants + lien dédié de l'entité ──
    const [scale, alerts, slug] = await Promise.all([
      autoScale(tenantId, { actorId: user.id }),
      recentPlanEvents(tenantId, 10),
      ensureStructureSlug(tenantId),
    ]);

    res.json({
      today: { total: todayTotal, count: todayColl.length, cash: todayColl.filter((c) => c.method === "cash").reduce((s, c) => s + c.amount, 0), mobile: todayColl.filter((c) => c.method === "mobile_money").reduce((s, c) => s + c.amount, 0) },
      week: { total: weekTotal, count: weekColl.length },
      month: { total: monthTotal, count: monthCount },
      dailySeries,
      byAgent: [...byAgent.entries()].map(([name, amount]) => ({ name, amount })),
      byArea: [...byArea.entries()].map(([name, amount]) => ({ name, amount })),
      latePassbooks,
      unresolvedClosings: unresolvedClosings.map((cl) => ({
        id: cl.id,
        day: cl.day,
        agent: cl.agent?.fullName ?? "—",
        declaredCash: cl.declaredCash,
        expectedCash: cl.expectedCash,
        gap: cl.gap,
        status: cl.status,
      })),
      recent,
      contributors: { total: contributorsCount, activeThisMonth },
      scaling: {
        plan: scale.snapshot.plan,
        planLabel: scale.snapshot.planLabel,
        contributors: scale.snapshot.contributors,
        agents: scale.snapshot.agents,
        volumeMonth: scale.snapshot.volumeMonth,
        requiredPlan: scale.requiredPlan,
        upgraded: scale.upgraded,
      },
      alerts: { unread: alerts.unread, events: alerts.events },
      entity: { name: structure?.name ?? "", slug, url: entityUrl(slug) },
    });
  })
);

// ── GET /api/manager/agents — équipe de la structure : agents collecteurs et gérants. ──
router.get(
  "/agents",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);
    const users = await db.user.findMany({
      where: { tenantId, role: { in: ["agent", "manager"] }, status: "active" },
      select: { id: true, fullName: true, phone: true, role: true, createdAt: true },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    });
    res.json({ users });
  })
);

// ── POST /api/manager/agents — création d'un compte agent OU gérant (équipe de la structure). ──
// L'administrateur principal (dirigeant) crée les comptes de ses gérants et de ses
// agents collecteurs ; le gérant crée les comptes agents de son équipe.
const createAgentSchema = z.object({
  fullName: z.string().min(2, "Saisis le nom complet."),
  phone: z.string().regex(/^\+?\d{8,15}$/, "Numéro invalide. Saisis le numéro complet, sans espace."),
  pin: z.string().regex(/^\d{6}$/, "Code PIN à 6 chiffres."),
  role: z.enum(["agent", "manager"]).optional().default("agent"),
});

router.post(
  "/agents",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const body = createAgentSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Formulaire incomplet.";
      throw new ApiError("invalid_input", issue);
    }
    // Les comptes gérant (back-office) ne sont créés que par le dirigeant de la structure.
    if (body.data.role === "manager" && user.role !== "owner") {
      throw new ApiError(
        "forbidden",
        "Seul l'administrateur principal (dirigeant) crée les comptes gérant.",
        403
      );
    }
    const phone = body.data.phone.replace(/\s+/g, "");
    const existing = await db.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ApiError("phone_taken", "Ce numéro a déjà un compte.");
    }

    // Quota d'agents du palier courant — avec montée en charge AUTOMATIQUE :
    // la création projette +1 agent ; si le palier ne suffit plus, le système
    // bascule le palier supérieur et prévient les dirigeants, sans bloquer l'équipe.
    let autoUpgrade: { from: string | null; to: string } | null = null;
    if (body.data.role === "agent") {
      const scale = await autoScale(tenantId, { extraAgents: 1, actorId: user.id });
      autoUpgrade = scale.upgraded ? { from: scale.fromPlan, to: scale.toPlan } : null;
      const plan = planOf(scale.snapshot.plan);
      const agentsCount = scale.snapshot.agents;
      if (agentsCount >= plan.agents) {
        throw new ApiError(
          "agent_quota_reached",
          `Ton palier ${plan.label} inclut ${plan.agents} agent${plan.agents > 1 ? "s" : ""} de collecte et tu les as tous atteints : c'est le palier maximum. Contacte le support TontiHelm.`,
          403
        );
      }
    }

    const created = await db.user.create({
      data: {
        tenantId,
        phone,
        fullName: body.data.fullName,
        role: body.data.role,
        pinHash: hashPin(body.data.pin),
      },
    });
    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "team_member_created",
      entity: "user",
      entityId: created.id,
      payload: { fullName: created.fullName, phone: created.phone, role: created.role },
    });

    res.status(201).json({
      member: {
        id: created.id,
        fullName: created.fullName,
        phone: created.phone,
        role: created.role,
      },
      autoUpgrade,
    });
  })
);

// ── GET /api/manager/contributors — liste des cotisants, avec TOUS leurs carnets. ──
router.get(
  "/contributors",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);

    const [contributors, slug] = await Promise.all([
      db.contributor.findMany({
        where: { tenantId },
        include: {
          agent: { select: { fullName: true } },
          passbooks: { where: { status: { in: ["active", "late", "closing", "completed", "closed"] } }, include: { collections: true }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { fullName: "asc" },
      }),
      ensureStructureSlug(tenantId),
    ]);

    res.json({
      contributors: contributors.map((c) => {
        const carnets = c.passbooks.map((pb) => {
          const balance = passbookBalance(pb.collections);
          const livret = buildLivret(pb, balance);
          return {
            id: pb.id,
            number: pb.number,
            label: pb.label,
            dailyAmount: pb.dailyAmount,
            balance,
            coveredLines: livret.coveredLines,
            payableLines: livret.payableLines,
            missedLines: livret.missedLines,
            currentSheet: livret.currentSheet,
            months: livret.months,
            status: pb.status,
          };
        });
        return {
          id: c.id,
          fullName: c.fullName,
          phone: c.phone,
          email: c.email,
          neighborhood: c.neighborhood,
          idNumber: c.idNumber,
          agent: c.agent?.fullName ?? "—",
          agentId: c.agentId,
          status: c.status,
          createdAt: c.createdAt,
          shareToken: c.shareToken,
          shareUrl: c.shareToken ? carnetUrl(slug, c.shareToken) : null,
          carnets,
          activeCarnets: carnets.filter((k) => k.status === "active" || k.status === "late").length,
        };
      }),
    });
  })
);

// ── POST /api/manager/contributors — nouveau cotisant (M2). ──
const createContributorSchema = z.object({
  fullName: z.string().min(2, "Saisis le nom complet du cotisant."),
  phone: z.string().regex(/^\+?\d{8,15}$/, "Numéro invalide. Saisis le numéro complet, sans espace."),
  email: z.string().email("Adresse e-mail invalide.").optional().or(z.literal("")),
  neighborhood: z.string().min(2, "Saisis le quartier."),
  idNumber: z.string().min(3, "Saisis le numéro de pièce d'identité."),
  agentId: z.string().min(1, "Choisis l'agent référent."),
});

router.post(
  "/contributors",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const body = createContributorSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Formulaire incomplet.";
      throw new ApiError("invalid_input", issue);
    }
    const agent = await db.user.findFirst({
      where: { id: body.data.agentId, tenantId, role: "agent" },
    });
    if (!agent) throw new ApiError("not_found", "Agent introuvable dans ta structure.", 404);

    // ── Montée en charge automatique : la création projette +1 cotisant ; le
    // système scale le palier tout seul au besoin (alerte aux dirigeants incluse). ──
    const scale = await autoScale(tenantId, { extraContributors: 1, actorId: user.id });
    const contributorsCount = scale.snapshot.contributors;
    const plan = planOf(scale.snapshot.plan);
    if (contributorsCount >= plan.contributors) {
      throw new ApiError(
        "contributor_quota_reached",
        `Ton palier ${plan.label} inclut ${plan.contributors} cotisants et tu les as tous atteints : c'est le palier maximum. Contacte le support TontiHelm.`,
        403
      );
    }

    const contributor = await db.contributor.create({
      data: {
        tenantId,
        fullName: body.data.fullName,
        phone: body.data.phone,
        email: body.data.email || null,
        neighborhood: body.data.neighborhood,
        idNumber: body.data.idNumber,
        agentId: agent.id,
      },
    });
    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "contributor_created",
      entity: "contributor",
      entityId: contributor.id,
      payload: { fullName: contributor.fullName, neighborhood: contributor.neighborhood, agent: agent.fullName },
    });

    // Lien personnel du carnet, prêt à partager par WhatsApp / e-mail.
    const shareUrl = await ensureShareToken(contributor.id);

    res.status(201).json({ contributor: { id: contributor.id, fullName: contributor.fullName }, shareUrl });
  })
);

// ── POST /api/manager/contributors/:id/share — (re)génère le lien de carnet d'un cotisant. ──
router.post(
  "/contributors/:id/share",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner"]);
    const tenantId = requireTenant(user);

    const contributor = await db.contributor.findUnique({ where: { id: req.params.id } });
    if (!contributor || contributor.tenantId !== tenantId) {
      throw new ApiError("not_found", "Cotisant introuvable.", 404);
    }
    const url = await ensureShareToken(contributor.id);
    res.json({ url });
  })
);

// ── POST /api/manager/contributors/:id/reassign — réassignation d'agent en cours
// de cycle (décision n° 4 du dirigeant, PARITE.md §8.13). Tous les carnets
// ACTIFS du cotisant suivent le nouvel agent ; les carnets terminés et toutes
// les écritures passées conservent leur agent d'origine ; la tournée du jour
// est recalculée pour les deux agents (elle se déduit des carnets).
const reassignSchema = z.object({
  agentId: z.string().min(1, "Choisis le nouvel agent."),
});

router.post(
  "/contributors/:id/reassign",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const body = reassignSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Formulaire incomplet.";
      throw new ApiError("invalid_input", issue);
    }

    const contributor = await db.contributor.findUnique({
      where: { id: req.params.id },
      include: { agent: { select: { id: true, fullName: true } } },
    });
    if (!contributor || contributor.tenantId !== tenantId) {
      throw new ApiError("not_found", "Cotisant introuvable.", 404);
    }
    if (contributor.status !== "active") {
      throw new ApiError("bad_state", "Ce cotisant n'est plus actif : aucune réassignation possible.", 400);
    }

    // Agent cible : actif, rôle agent, MÊME structure (isolation multi-tenant).
    const target = await db.user.findFirst({
      where: { id: body.data.agentId, tenantId, role: "agent" },
    });
    if (!target) throw new ApiError("not_found", "Agent introuvable dans ta structure.", 404);
    if (target.status !== "active") {
      throw new ApiError("bad_state", "Cet agent n'est plus actif : choisis un autre agent.", 400);
    }
    if (target.id === contributor.agentId) {
      throw new ApiError("same_agent", `${contributor.fullName} est déjà rattaché à ${target.fullName}.`, 400);
    }

    // Les carnets en cours de collecte (active | late) suivent le nouvel agent.
    // Les carnets closing/completed/closed/withdrawn restent à l'agent qui les
    // a menés — comme les encaissements déjà écrits (Collection.agentId d'origine).
    const moved = await db.passbook.updateMany({
      where: { contributorId: contributor.id, tenantId, status: { in: ["active", "late"] } },
      data: { agentId: target.id },
    });
    await db.contributor.update({
      where: { id: contributor.id },
      data: { agentId: target.id },
    });

    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "agent_reassigned",
      entity: "contributor",
      entityId: contributor.id,
      payload: {
        contributor: contributor.fullName,
        fromAgent: contributor.agent?.fullName ?? "—",
        toAgent: target.fullName,
        passbooksMoved: moved.count,
      },
    });

    // Temps réel web ↔ mobile (§8.18) : la tournée des DEUX agents change dès
    // la validation — les écrans abonnés au flux se rafraîchissent.
    publishTenantEvent({
      type: "contributor",
      tenantId,
      at: new Date().toISOString(),
      contributorId: contributor.id,
      agentId: target.id,
    });

    res.json({
      ok: true,
      passbooksMoved: moved.count,
      message:
        `${contributor.fullName} est désormais collecté par ${target.fullName} : ` +
        `${moved.count} carnet${moved.count > 1 ? "s" : ""} actif${moved.count > 1 ? "s" : ""} ` +
        `${moved.count > 1 ? "suivent" : "suit"} le nouvel agent, la tournée du jour est recalculée pour les deux agents.`,
    });
  })
);

// ── GET /api/manager/passbooks — liste des carnets (livrets annuels) avec soldes. ──
router.get(
  "/passbooks",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);

    const structure = await db.structure.findUnique({ where: { id: tenantId } });
    const passbooks = await db.passbook.findMany({
      where: { tenantId },
      include: {
        contributor: true,
        agent: { select: { fullName: true } },
        collections: true,
      },
      orderBy: { number: "asc" },
    });

    res.json({
      passbooks: passbooks.map((pb) => {
        const balance = passbookBalance(pb.collections);
        const livret = buildLivret(pb, balance);
        const late = pb.status === "active" && livret.missedLines >= (structure?.lateThreshold ?? 3);
        return {
          id: pb.id,
          number: pb.number,
          label: pb.label,
          contributor: pb.contributor.fullName,
          phone: pb.contributor.phone,
          neighborhood: pb.contributor.neighborhood,
          agent: pb.agent?.fullName ?? "—",
          dailyAmount: pb.dailyAmount,
          cycleDays: pb.cycleDays,
          startsOn: pb.startsOn,
          status: late ? "late" : pb.status,
          balance,
          coveredLines: livret.coveredLines,
          payableLines: livret.payableLines,
          excusedLines: livret.excusedLines,
          missedLines: livret.missedLines,
          currentSheet: livret.currentSheet,
          months: livret.months,
          cycleTotal: livret.recap.attendu,
        };
      }),
    });
  })
);

// ── POST /api/manager/passbooks — nouveau livret pour un cotisant (M2). ──
// La mise journalière suffit : le livret démarre automatiquement au mois en
// cours et compte 12 feuilles mensuelles + la 13e feuille de récapitulatif.
// Durée du cycle OPTIONNELLE (§8.14, décision n° 5) : bornée 1..372 jours,
// défaut 372 (livret annuel) — une durée courte réduit le nombre de feuilles,
// la dernière feuille peut être partielle.
const createPassbookSchema = z.object({
  contributorId: z.string().min(1, "Choisis le cotisant."),
  dailyAmount: z.number().int().min(100, "La mise journalière minimum est de 100 FCFA."),
  label: z.string().max(60, "Le surnom du carnet est trop long.").optional().or(z.literal("")),
  cycleDays: z
    .number()
    .int()
    .min(1, "La durée minimum d'un cycle est de 1 jour.")
    .max(372, "La durée maximum d'un cycle est de 372 jours (livret annuel).")
    .optional(),
});

router.post(
  "/passbooks",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const body = createPassbookSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Formulaire incomplet.";
      throw new ApiError("invalid_input", issue);
    }
    const contributor = await db.contributor.findFirst({
      where: { id: body.data.contributorId, tenantId },
    });
    if (!contributor) throw new ApiError("not_found", "Cotisant introuvable.", 404);

    const last = await db.passbook.findFirst({ where: { tenantId }, orderBy: { number: "desc" } });
    const nextNumber = String((last ? parseInt(last.number, 10) : 100) + 1).padStart(4, "0");
    const startsOn = livretMonthStart(new Date());
    const cycleDays = body.data.cycleDays ?? LIVRET_DAYS;

    const passbook = await db.passbook.create({
      data: {
        tenantId,
        contributorId: contributor.id,
        agentId: contributor.agentId,
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
      },
    });

    res.json({ passbook: { id: passbook.id, number: nextNumber, label: passbook.label } });
  })
);

// ── GET /api/manager/passbooks/:id/carnet — livret annuel détaillé. ──
// Renvoie le livret complet : 12 feuilles mensuelles (31 lignes, la 31e = mise
// de l'entreprise, champs avance/reste) + la 13e feuille de récapitulatif,
// l'état de la signature de fin de souscription, et toutes les écritures.
router.get(
  "/passbooks/:id/carnet",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller", "agent"]);
    const tenantId = requireTenant(user);

    // Un agent ne consulte que les carnets de sa tournée.
    const where =
      user.role === "agent"
        ? { id: req.params.id, tenantId, agentId: user.id }
        : { id: req.params.id, tenantId };

    const passbook = await db.passbook.findFirst({
      where,
      include: {
        contributor: true,
        agent: { select: { fullName: true, phone: true } },
        collections: { orderBy: { collectedAt: "asc" } },
      },
    });
    if (!passbook) throw new ApiError("not_found", "Carnet introuvable.", 404);

    const structure = await db.structure.findUnique({ where: { id: tenantId } });
    const balance = passbookBalance(passbook.collections);
    const livret = buildLivret(passbook, balance);
    const late = passbook.status === "active" && livret.missedLines >= (structure?.lateThreshold ?? 3);

    res.json({
      passbook: {
        id: passbook.id,
        number: passbook.number,
        label: passbook.label,
        dailyAmount: passbook.dailyAmount,
        cycleDays: passbook.cycleDays,
        startsOn: passbook.startsOn,
        status: late ? "late" : passbook.status,
        closedAt: passbook.closedAt,
        createdAt: passbook.createdAt,
        balance,
        coveredLines: livret.coveredLines,
        payableLines: livret.payableLines,
        excusedLines: livret.excusedLines,
        missedLines: livret.missedLines,
        currentSheet: livret.currentSheet,
        cycleTotal: livret.recap.attendu,
        contributor: {
          id: passbook.contributor.id,
          fullName: passbook.contributor.fullName,
          phone: passbook.contributor.phone,
          neighborhood: passbook.contributor.neighborhood,
          idNumber: passbook.contributor.idNumber,
        },
        agent: passbook.agent?.fullName ?? "—",
      },
      livret: serializeLivret(livret),
      completion: {
        status: passbook.status,
        completedAt: passbook.completedAt,
        payoutAmount: passbook.payoutAmount,
        companyAmount: passbook.companyAmount,
        signatureName: passbook.signatureName,
        signedAt: passbook.signedAt,
      },
      collections: passbook.collections.map((c) => ({
        id: c.id,
        amount: c.amount,
        method: c.method,
        dayIndex: c.dayIndex,
        coversOn: c.coversOn,
        collectedAt: c.collectedAt,
        reversesId: c.reversesId,
      })),
      structure: {
        name: structure?.name ?? "",
        commissionDays: structure?.commissionDays ?? 1,
        lateThreshold: structure?.lateThreshold ?? 3,
      },
    });
  })
);

// ── POST /api/manager/passbooks/:id/complete — fin de souscription du client. ──
// Le client a fini de cotiser et prend définitivement son argent : le système
// calcule le récapitulatif (part entreprise = 31es mises, part client), prépare
// la remise et renvoie le lien de signature — le client signe SUR SON lien de
// carnet pour certifier qu'il a fini et pris son argent ; le carnet est alors
// archivé automatiquement (module Archive).
router.post(
  "/passbooks/:id/complete",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "agent"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const where =
      user.role === "agent"
        ? { id: req.params.id, tenantId, agentId: user.id }
        : { id: req.params.id, tenantId };
    const passbook = await db.passbook.findFirst({
      where,
      include: { contributor: true, collections: true },
    });
    if (!passbook) throw new ApiError("not_found", "Carnet introuvable.", 404);
    if (passbook.status === "completed") {
      throw new ApiError("bad_state", "Ce carnet est déjà clôturé et signé.", 409);
    }
    if (passbook.status === "closing") {
      // Idempotent : la remise est déjà préparée, on renvoie le lien de signature.
      const shareUrl = await ensureShareToken(passbook.contributorId);
      res.json({
        passbook: { id: passbook.id, number: passbook.number, status: "closing" },
        payoutAmount: passbook.payoutAmount,
        companyAmount: passbook.companyAmount,
        signUrl: shareUrl,
        message: "Remise déjà préparée : le client doit signer sur son lien de carnet.",
      });
      return;
    }

    const balance = passbookBalance(passbook.collections);
    const livret = buildLivret(passbook, balance);
    const payoutAmount = livret.recap.partClient;
    const companyAmount = livret.recap.partEntreprise;

    await db.passbook.update({
      where: { id: passbook.id },
      data: {
        status: "closing",
        closedAt: new Date(),
        payoutAmount,
        companyAmount,
      },
    });
    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "passbook_completion_initiated",
      entity: "passbook",
      entityId: passbook.id,
      payload: {
        number: passbook.number,
        contributor: passbook.contributor.fullName,
        totalEncaisse: livret.recap.encaisse,
        payoutAmount,
        companyAmount,
      },
    });

    const shareUrl = await ensureShareToken(passbook.contributorId);
    res.json({
      passbook: { id: passbook.id, number: passbook.number, status: "closing" },
      totalEncaisse: livret.recap.encaisse,
      payoutAmount,
      companyAmount,
      signUrl: shareUrl,
      message:
        `Remise préparée : ${formatFCFA(payoutAmount)} à remettre à ${passbook.contributor.fullName} ` +
        `(part entreprise : ${formatFCFA(companyAmount)}). Envoie-lui son lien de carnet : il y signe ` +
        `pour certifier qu'il a pris son argent, puis le carnet sera archivé automatiquement.`,
    });
  })
);

// ── GET /api/manager/archive — carnets archivés (fin de souscription signée). ──
// Catalogue année par année, par quartier et par client : chaque entrée conserve
// le numéro et le surnom du carnet, les totaux (encaissé, part entreprise, part
// client) et la signature numérique du client.
router.get(
  "/archive",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);

    const year = parseInt((req.query.year as string) ?? "", 10) || null;
    const neighborhood = ((req.query.neighborhood as string) ?? "").trim() || null;
    const contributorId = ((req.query.contributorId as string) ?? "").trim() || null;
    const search = ((req.query.search as string) ?? "").toLowerCase();

    const whereCompleted = { tenantId, status: "completed" as const };
    const archived = await db.passbook.findMany({
      where: whereCompleted,
      include: { contributor: true, agent: { select: { fullName: true } } },
      orderBy: [{ completedAt: "desc" }],
    });

    // Facettes : années et quartiers disponibles.
    const years = [...new Set(archived.map((p) => p.completedAt?.getUTCFullYear() ?? 0))].sort((a, b) => b - a);
    const neighborhoodsList = [...new Set(archived.map((p) => p.contributor.neighborhood ?? "—"))].sort((a, b) =>
      a.localeCompare(b, "fr")
    );

    const items = archived
      .filter((p) => (year ? (p.completedAt?.getUTCFullYear() ?? 0) === year : true))
      .filter((p) => (neighborhood ? (p.contributor.neighborhood ?? "—") === neighborhood : true))
      .filter((p) => (contributorId ? p.contributorId === contributorId : true))
      .filter((p) =>
        search
          ? p.contributor.fullName.toLowerCase().includes(search) ||
            p.number.includes(search) ||
            (p.label ?? "").toLowerCase().includes(search)
          : true
      )
      .map((p) => {
        return {
          id: p.id,
          number: p.number,
          label: p.label,
          dailyAmount: p.dailyAmount,
          contributor: {
            id: p.contributor.id,
            fullName: p.contributor.fullName,
            neighborhood: p.contributor.neighborhood,
          },
          agent: p.agent?.fullName ?? "—",
          completedAt: p.completedAt,
          year: p.completedAt?.getUTCFullYear() ?? 0,
          totalEncaisse: (p.payoutAmount ?? 0) + (p.companyAmount ?? 0),
          payoutAmount: p.payoutAmount,
          companyAmount: p.companyAmount,
          signature: {
            name: p.signatureName,
            signedAt: p.signedAt,
          },
        };
      });

    const totals = items.reduce(
      (acc, it) => ({
        count: acc.count + 1,
        totalEncaisse: acc.totalEncaisse + it.totalEncaisse,
        payoutAmount: acc.payoutAmount + (it.payoutAmount ?? 0),
        companyAmount: acc.companyAmount + (it.companyAmount ?? 0),
      }),
      { count: 0, totalEncaisse: 0, payoutAmount: 0, companyAmount: 0 }
    );

    res.json({
      years,
      neighborhoods: neighborhoodsList,
      items,
      totals,
    });
  })
);

// ── GET /api/manager/alerts — alertes de palier aux dirigeants (cloche). ──
router.get(
  "/alerts",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);
    const alerts = await recentPlanEvents(tenantId, 20);
    res.json(alerts);
  })
);

// ── POST /api/manager/alerts/read — marque toutes les alertes comme lues. ──
router.post(
  "/alerts/read",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);
    const read = await markPlanEventsRead(tenantId);
    res.json({ read });
  })
);

// ── GET /api/manager/collections — journal des encaissements. ──
router.get(
  "/collections",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);

    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10) || 1);
    const pageSize = 25;
    const method = req.query.method as string | undefined;
    const search = ((req.query.search as string) ?? "").toLowerCase();
    // Filtre période : bornes incluses (AAAA-MM-JJ). Absentes → tout l'historique.
    const fromParam = parseDayParam(req.query.from);
    const toParam = parseDayParam(req.query.to);
    const periodWhere =
      fromParam || toParam
        ? {
            collectedAt: {
              ...(fromParam ? { gte: fromParam } : {}),
              ...(toParam ? { lt: new Date(toParam.getTime() + 24 * 60 * 60 * 1000) } : {}),
            },
          }
        : {};

    const where = {
      tenantId,
      ...periodWhere,
      ...(method === "cash" || method === "mobile_money" ? { method } : {}),
    };
    const [total, collections] = await Promise.all([
      db.collection.count({ where }),
      db.collection.findMany({
        where,
        include: {
          passbook: { include: { contributor: true } },
          agent: { select: { fullName: true } },
        },
        orderBy: { collectedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const rows = collections
      .filter((c) => {
        if (!search) return true;
        const name = c.passbook?.contributor?.fullName?.toLowerCase() ?? "";
        const num = c.passbook?.number?.toLowerCase() ?? "";
        return name.includes(search) || num.includes(search);
      })
      .map((c) => ({
        id: c.id,
        at: c.collectedAt,
        amount: c.amount,
        method: c.method,
        dayIndex: c.dayIndex,
        coversOn: c.coversOn,
        contributor: c.passbook?.contributor?.fullName ?? "—",
        passbook: c.passbook?.number ?? "",
        agent: c.agent?.fullName ?? "—",
        reversesId: c.reversesId,
      }));

    res.json({ collections: rows, page, pageSize, total });
  })
);

// ── POST /api/manager/collections — annulation par écriture inverse (M8 : jamais de suppression). ──
const reverseSchema = z.object({
  action: z.literal("reverse"),
  collectionId: z.string().min(1),
  reason: z.string().min(3, "Indique le motif de l'annulation."),
});

router.post(
  "/collections",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const body = reverseSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Requête invalide.";
      throw new ApiError("invalid_input", issue);
    }
    const original = await db.collection.findUnique({
      where: { id: body.data.collectionId },
      include: { passbook: { include: { contributor: true } } },
    });
    if (!original || original.tenantId !== tenantId) {
      throw new ApiError("not_found", "Encaissement introuvable.", 404);
    }
    if (original.amount < 0) {
      throw new ApiError("bad_state", "Cette écriture est déjà une annulation.", 409);
    }
    const alreadyReversed = await db.collection.findFirst({
      where: { reversesId: original.id, tenantId },
    });
    if (alreadyReversed) {
      throw new ApiError("bad_state", "Cet encaissement est déjà annulé.", 409);
    }

    // Une clôture validée verrouille les encaissements de la journée.
    const dayStart = new Date(original.collectedAt);
    dayStart.setHours(0, 0, 0, 0);
    const closing = await db.closing.findFirst({
      where: { tenantId, agentId: original.agentId, day: dayStart, status: "validated" },
    });
    if (closing) {
      throw new ApiError("day_locked", "Clôture validée : cet encaissement ne peut plus être annulé.", 409);
    }

    const reversalId = randomUUID();
    await db.collection.create({
      data: {
        id: reversalId,
        tenantId,
        passbookId: original.passbookId,
        agentId: original.agentId,
        amount: -original.amount,
        method: original.method,
        dayIndex: original.dayIndex,
        coversOn: original.coversOn, // l'annulation retire la même journée couverte
        reversesId: original.id,
        collectedAt: new Date(),
      },
    });
    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "reverse",
      entity: "collection",
      entityId: reversalId,
      payload: {
        reverses: original.id,
        passbook: original.passbook?.number,
        contributor: original.passbook?.contributor?.fullName,
        amount: -original.amount,
        reason: body.data.reason,
      },
    });

    const all = await db.collection.findMany({ where: { passbookId: original.passbookId } });
    res.json({
      reversalId,
      message: "Écriture d'annulation créée. La ligne précédente reste dans le journal.",
      newBalance: passbookBalance(all),
    });
  })
);

// ── GET /api/manager/closings — clôtures de caisse de la structure. ──
router.get(
  "/closings",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);

    const closings = await db.closing.findMany({
      where: { tenantId },
      include: { agent: { select: { fullName: true } } },
      orderBy: { day: "desc" },
      take: 30,
    });
    res.json({
      closings: closings.map((c) => ({
        id: c.id,
        day: c.day,
        agent: c.agent?.fullName ?? "—",
        declaredCash: c.declaredCash,
        expectedCash: c.expectedCash,
        gap: c.gap,
        status: c.status,
        validatedAt: c.validatedAt,
      })),
    });
  })
);

// ── POST /api/manager/closings — validation ou contestation par le gérant (M5). ──
const closingActionSchema = z.object({
  action: z.enum(["validate", "contest"]),
  closingId: z.string().min(1),
  note: z.string().optional(),
});

router.post(
  "/closings",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const body = closingActionSchema.safeParse(req.body ?? {});
    if (!body.success) throw new ApiError("invalid_input", "Action invalide.");
    const closing = await db.closing.findFirst({ where: { id: body.data.closingId, tenantId } });
    if (!closing) throw new ApiError("not_found", "Clôture introuvable.", 404);
    if (closing.status === "validated") {
      throw new ApiError("bad_state", "Cette clôture est déjà validée.", 409);
    }

    if (body.data.action === "validate") {
      await db.closing.update({
        where: { id: closing.id },
        data: { status: "validated", validatedBy: user.id, validatedAt: new Date() },
      });
      await appendAudit({
        tenantId,
        actorId: user.id,
        action: "closing_validated",
        entity: "closing",
        entityId: closing.id,
        payload: { day: closing.day.toISOString().slice(0, 10), gap: closing.gap, decision: "validated" },
      });
      // Temps réel web ↔ mobile : la journée passe sous verrou — les agents
      // (web ET mobile) apprennent la clôture sans attendre un rafraîchissement.
      publishTenantEvent({
        type: "closing",
        tenantId,
        at: new Date().toISOString(),
        agentId: closing.agentId,
        source: "manager",
      });
      res.json({ message: "Clôture validée. Les encaissements du jour sont verrouillés." });
      return;
    }

    await db.closing.update({
      where: { id: closing.id },
      data: { status: "disputed", validatedBy: user.id, validatedAt: new Date() },
    });
    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "closing_validated",
      entity: "closing",
      entityId: closing.id,
      payload: { day: closing.day.toISOString().slice(0, 10), gap: closing.gap, decision: "disputed", note: body.data.note ?? null },
    });
    // Temps réel web ↔ mobile : contestation notifiée aux agents connectés.
    publishTenantEvent({
      type: "closing",
      tenantId,
      at: new Date().toISOString(),
      agentId: closing.agentId,
      source: "manager",
    });
    res.json({ message: "Clôture contestée. L'agent est notifié pour vérification." });
  })
);

// ── GET /api/manager/audit — journal d'audit paginé (M8, contrôleur inclus). ──
router.get(
  "/audit",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);

    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10) || 1);
    const action = (req.query.action as string) ?? "";
    const pageSize = 30;

    const where = { tenantId, ...(action ? { action } : {}) };
    const [total, logs, chainOk] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        include: { actor: { select: { fullName: true, role: true } } },
        orderBy: { seq: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      verifyAuditChain(tenantId),
    ]);

    const actions = await db.auditLog.groupBy({ by: ["action"], where: { tenantId }, _count: true });

    res.json({
      chainOk,
      actions: actions.map((a) => ({ action: a.action, count: a._count })),
      logs: logs.map((l) => ({
        seq: Number(l.seq),
        at: l.at,
        actor: l.actor?.fullName ?? "Système",
        actorRole: l.actor?.role ?? "system",
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        payload: JSON.parse(l.payload),
        hash: l.hash.slice(0, 12),
      })),
      page,
      pageSize,
      total,
    });
  })
);

// ── POST /api/manager/passbooks/:id/remind — relance WhatsApp du cotisant en retard (paliers Pro et Institution). ──
// Plus de SMS : la relance ouvre WhatsApp avec un message prêt à envoyer, contenant
// le lien personnel du carnet (jours manqués visibles). L'envoi est journalisé
// comme notification WhatsApp (coût nul).
router.post(
  "/passbooks/:id/remind",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const passbook = await db.passbook.findUnique({
      where: { id: req.params.id },
      include: { contributor: true, collections: true, agent: true },
    });
    if (!passbook || passbook.tenantId !== tenantId) {
      throw new ApiError("not_found", "Carnet introuvable.", 404);
    }
    if (passbook.status !== "active") {
      throw new ApiError("bad_state", "Ce carnet n'est plus actif.", 400);
    }
    if (!passbook.contributor.phone) {
      throw new ApiError("no_phone", "Ce cotisant n'a pas de numéro de téléphone enregistré.", 400);
    }

    // Fonctionnalité incluse à partir du palier Pro uniquement.
    const sub = await getSubscription(tenantId);
    const plan = planOf(sub?.plan);
    if (!plan.reminders) {
      throw new ApiError(
        "plan_required",
        "Les relances automatiques aux cotisants sont incluses dans les paliers Pro et Institution. Passe au palier supérieur pour les activer.",
        403
      );
    }

    const balance = passbookBalance(passbook.collections);
    const missed = buildLivret(passbook, balance).missedLines;
    if (missed < 1) {
      throw new ApiError("bad_state", "Ce carnet n'a aucune ligne manquée : aucune relance à envoyer.", 400);
    }

    // Lien personnel du carnet : le cotisant y voit les jours manqués et verse.
    const shareUrl = await ensureShareToken(passbook.contributorId);
    const message =
      `Bonjour ${passbook.contributor.fullName}, ton carnet ${passbook.number} indique ` +
      `${missed} jour${missed > 1 ? "s" : ""} sans versement. Consulte ton carnet et régularise ` +
      `avec ${passbook.agent?.fullName ?? "ton agent"} : ${shareUrl}`;
    const whatsappUrl = whatsappShareUrl(passbook.contributor.phone, message);

    await db.notification.create({
      data: {
        tenantId,
        channel: "whatsapp",
        template: "late_reminder",
        toPhone: passbook.contributor.phone,
        content: message,
        status: "sent",
        costFcfa: 0,
      },
    });
    await appendAudit({
      tenantId,
      actorId: user.id,
      action: "reminder_sent",
      entity: "passbook",
      entityId: passbook.id,
      payload: { contributor: passbook.contributor.fullName, missedDays: missed, channel: "whatsapp", shareUrl },
    });

    res.json({
      ok: true,
      whatsappUrl,
      shareUrl,
      message: `Relance WhatsApp prête pour ${passbook.contributor.fullName} (${missed} jours manqués) : le message contient le lien de son carnet.`,
    });
  })
);

// ── GET /api/manager/billing — abonnement, montée en charge, factures et usage (M9). ──
router.get(
  "/billing",
  h(async (req, res) => {
    const user = await requireUser(req);
    requireRole(user, ["manager", "owner", "controller"]);
    const tenantId = requireTenant(user);

    const [structure, subscription, invoices, agentsCount, contributorsCount, alerts, slug] =
      await Promise.all([
        db.structure.findUnique({ where: { id: tenantId } }),
        db.subscription.findUnique({ where: { tenantId } }),
        db.invoice.findMany({ where: { tenantId }, orderBy: { period: "desc" } }),
        db.user.count({ where: { tenantId, role: "agent" } }),
        db.contributor.count({ where: { tenantId, status: "active" } }),
        recentPlanEvents(tenantId, 20),
        ensureStructureSlug(tenantId),
      ]);

    const planKey = subscription?.plan ?? "demarrage";
    const plan = planOf(planKey);
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const volumeAgg = await db.collection.aggregate({
      where: { tenantId, collectedAt: { gte: since30 } },
      _sum: { amount: true },
    });
    const volumeMonth = Math.max(0, volumeAgg._sum.amount ?? 0);

    res.json({
      structure: { name: structure?.name, status: structure?.status },
      entity: { slug, url: entityUrl(slug) },
      subscription: subscription
        ? {
            plan: planKey,
            planLabel: plan.label,
            price: plan.price,
            status: subscription.status,
            trialEndsAt: subscription.trialEndsAt,
            periodStart: subscription.periodStart,
            periodEnd: subscription.periodEnd,
          }
        : null,
      usage: {
        agents: agentsCount,
        agentsQuota: plan.agents,
        contributors: contributorsCount,
        contributorsQuota: plan.contributors,
        extraContributors: Math.max(0, contributorsCount - plan.contributors),
        extraAgents: Math.max(0, agentsCount - plan.agents),
        remindersIncluded: plan.reminders,
        volumeMonth,
      },
      alerts,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        period: inv.period,
        baseAmount: inv.baseAmount,
        extras: JSON.parse(inv.extras),
        total: inv.total,
        status: inv.status,
        paidAt: inv.paidAt,
        createdAt: inv.createdAt,
      })),
    });
  })
);

export default router;
