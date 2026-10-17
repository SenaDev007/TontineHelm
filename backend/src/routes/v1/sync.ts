// TontiHelm — /v1/sync/* : synchronisation mobile agent (phase 1, §8.2/§8.3/§8.6/§8.9).
//   POST /v1/sync/push  : lot ≤ 50 événements, idempotent par UUID, réponse
//                         PAR ÉVÉNEMENT (accepté | doublon | rejeté + motif) —
//                         le rejet métier ne fait PLUS échouer le lot entier,
//                         contrairement au canal web (écart documenté, PARITE.md
//                         §5 ligne 6) ; mêmes règles métier via le moteur partagé
//                         lib/sync-engine.ts ;
//   GET  /v1/sync/pull   : snapshot complet (premier appel) puis delta
//                         incrémental (curseur = horodatage serveur) : données
//                         de référence + tournée, pour le mode hors ligne.
// Verrou de clôture : PAR événement, sur la journée couverte par l'événement
// (écart n° 3 — les événements datés d'un autre jour que la clôture validée ne
// sont pas bloqués) ; le canal web garde sa garde de lot, inchangée.
// Débit : 300 requêtes/minute par appareil (§8.9), compteur en mémoire.
// Horloge : décalage mesuré à chaque appel ; > 10 minutes → alerte au gérant
// (PlanEvent device_clock_skew, au plus une par jour et par appareil) et
// marquage des écritures (payload d'audit + Device.clockSkewMs) (§8.6).
import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "../../lib/db";
import { requireRole, requireTenant, ApiError, h } from "../../lib/auth";
import { assertWritable } from "../../lib/tenant";
import { SyncPushSchema } from "../../lib/schemas/sync";
import { applyCollectionEvent } from "../../lib/sync-engine";
import { livretStop } from "../../lib/tour";
import { requireMobileUser, verifyAccessToken } from "../../lib/mobile-auth";
import { ensureStructureSlug, carnetUrl, entityUrl } from "../../lib/share";

const router = Router();

// ── Limite de débit : 300 req/min par appareil sur /v1/sync/* (§8.9). ──
// Plafond relu à CHAQUE requête (surchargeable pour les tests via
// SYNC_RATE_LIMIT_PER_MIN) ; compteur en mémoire, fenêtre fixe de 60 s.
const rateBuckets = new Map<string, { windowStart: number; count: number }>();

router.use((req: Request, res: Response, next: NextFunction) => {
  const limit = Number(process.env.SYNC_RATE_LIMIT_PER_MIN ?? 300);
  const header = req.headers.authorization;
  const claims = header?.startsWith("Bearer ") ? verifyAccessToken(header.slice(7).trim()) : null;
  if (!claims) return next(); // sans jeton valide, l'authentification répondra 401
  const now = Date.now();
  let bucket = rateBuckets.get(claims.did);
  if (!bucket || now - bucket.windowStart >= 60_000) {
    bucket = { windowStart: now, count: 0 };
    rateBuckets.set(claims.did, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    res
      .status(429)
      .json({ error: { code: "rate_limited", message: "Trop de requêtes de synchronisation. Patiente une minute." } });
    return;
  }
  next();
});

// ── Décalage d'horloge (§8.6) : mesure, enregistrement, alerte gérant. ──
const CLOCK_SKEW_ALERT_MS = 10 * 60 * 1000;

async function measureClockSkew(tenantId: string, deviceId: string, clientTimeIso: string | undefined, now: Date) {
  const data: { lastSyncAt: Date; clockSkewMs?: number } = { lastSyncAt: now };
  let skewMs: number | null = null;
  if (clientTimeIso) {
    const clientTime = new Date(clientTimeIso);
    if (!Number.isNaN(clientTime.getTime())) {
      skewMs = now.getTime() - clientTime.getTime();
      data.clockSkewMs = skewMs;
    }
  }
  await db.device.update({ where: { id: deviceId }, data }).catch(() => undefined);
  if (skewMs !== null && Math.abs(skewMs) > CLOCK_SKEW_ALERT_MS) {
    // Au plus une alerte par jour et par appareil (message porte l'identifiant).
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const already = await db.planEvent.findFirst({
      where: { tenantId, kind: "device_clock_skew", createdAt: { gte: since }, message: { contains: deviceId } },
    });
    if (!already) {
      const minutes = Math.round(Math.abs(skewMs) / 60_000);
      const device = await db.device.findUnique({ where: { id: deviceId }, include: { user: true } });
      await db.planEvent.create({
        data: {
          tenantId,
          kind: "device_clock_skew",
          fromPlan: null,
          toPlan: null,
          message:
            `L'appareil « ${device?.label ?? deviceId} » de ${device?.user.fullName ?? "un agent"} ` +
            `a ${minutes} minute${minutes > 1 ? "s" : ""} de ${skewMs > 0 ? "retard" : "avance"} ` +
            `sur l'heure du serveur — encaissements horodatés à contrôler. (appareil ${deviceId})`,
        },
      });
    }
  }
  return skewMs;
}

/** Jour calendaire (serveur, minuit local) couvert par un événement. */
function eventDay(ev: { coversOn?: string | null; collectedAt: string }): Date {
  if (ev.coversOn) {
    const d = new Date(`${ev.coversOn}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(ev.collectedAt);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── POST /v1/sync/push — accusé PAR ÉVÉNEMENT (§8.2). ──
router.post(
  "/push",
  h(async (req, res) => {
    const { user, device } = await requireMobileUser(req);
    requireRole(user, ["agent"]);
    const tenantId = requireTenant(user);
    await assertWritable(tenantId);

    const body = SyncPushSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Lot invalide.";
      throw new ApiError("invalid_input", issue);
    }

    const now = new Date();
    const skewMs = await measureClockSkew(tenantId, device.id, body.data.clientTime, now);

    const acks: {
      id: string;
      status: "accepted" | "duplicate" | "rejected";
      collectionId?: string;
      reason?: { code: string; message: string };
    }[] = [];

    for (const ev of body.data.events) {
      // Verrou de clôture PAR ÉVÉNEMENT, sur la journée qu'il couvre : les
      // écritures datées d'une journée déjà validée sont refusées seules,
      // les autres passent (écart n° 3).
      const day = eventDay(ev);
      const validated = await db.closing.findFirst({
        where: { tenantId, agentId: user.id, day, status: "validated" },
      });
      if (validated) {
        acks.push({
          id: ev.id,
          status: "rejected",
          reason: {
            code: "day_locked",
            message: "Clôture validée. Les encaissements du jour sont verrouillés.",
          },
        });
        continue;
      }
      try {
        const result = await applyCollectionEvent({
          tenantId,
          agentId: user.id,
          ev,
          source: "sync_v1",
          extraPayload: {
            deviceId: device.id,
            ...(skewMs !== null ? { clockSkewMs: skewMs } : {}),
          },
        });
        acks.push({
          id: result.id,
          status: result.status === "created" ? "accepted" : "duplicate",
          collectionId: result.collectionId,
        });
      } catch (err) {
        if (err instanceof ApiError) {
          acks.push({ id: ev.id, status: "rejected", reason: { code: err.code, message: err.message } });
          continue;
        }
        throw err;
      }
    }

    res.json({
      acks,
      serverTime: now.toISOString(),
      device: { id: device.id, clockSkewMs: skewMs ?? device.clockSkewMs },
    });
  })
);

// ── GET /v1/sync/pull?cursor= — snapshot complet puis delta incrémental (§8.3). ──
router.get(
  "/pull",
  h(async (req, res) => {
    const { user, device } = await requireMobileUser(req);
    requireRole(user, ["agent"]);
    const tenantId = requireTenant(user);

    // Curseur : horodatage serveur du pull précédent. Absent → snapshot complet.
    const cursorParam = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : null;
    let since: Date | null = null;
    if (cursorParam) {
      since = new Date(cursorParam);
      if (Number.isNaN(since.getTime())) {
        throw new ApiError(
          "invalid_cursor",
          "Curseur invalide — refais une synchronisation complète (sans curseur).",
          400
        );
      }
    }
    const clientTime = typeof req.query.clientTime === "string" ? req.query.clientTime : undefined;
    const now = new Date();
    const skewMs = await measureClockSkew(tenantId, device.id, clientTime, now);

    const structure = await db.structure.findUnique({ where: { id: tenantId } });
    const lateThreshold = structure?.lateThreshold ?? 3;
    const slug = await ensureStructureSlug(tenantId);

    // Le curseur renvoyé est capturé AVANT les lectures : une écriture concurrente
    // peut donc revenir deux fois — le téléphone upsert, c'est idempotent.
    const cursor = now.toISOString();

    // ── Données de référence : portefeuille de l'agent ──
    // Plein : cotisants avec TOUS leurs carnets (archive comprise, comme
    // l'écran Clients du web). Delta : seuls les cotisants modifiés — les
    // carnets touchés sont rassemblés séparément juste après.
    const contributors = await db.contributor.findMany({
      where: {
        agentId: user.id,
        ...(since ? { OR: [{ updatedAt: { gt: since } }, { createdAt: { gt: since } }] } : {}),
      },
      orderBy: { fullName: "asc" },
      include: {
        // En delta, seules les fiches cotisants modifiées sont utiles (les
        // carnets touchés sont rassemblés séparément) ; en plein, tout part.
        passbooks: {
          include: { collections: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const serializedPassbooks: Record<string, unknown>[] = [];
    const pushPassbook = (
      pb: {
        id: string;
        number: string;
        label: string | null;
        dailyAmount: number;
        startsOn: Date;
        status: string;
        cycleDays: number;
        createdAt: Date;
        updatedAt: Date | null;
        contributorId: string;
        collections: { amount: number }[];
      },
      shareToken: string | null
    ) => {
      serializedPassbooks.push({
        contributorId: pb.contributorId,
        agentId: user.id,
        ...livretStop(pb, pb.collections, lateThreshold),
        status: pb.status,
        cycleDays: pb.cycleDays,
        startsOn: pb.startsOn.toISOString(),
        createdAt: pb.createdAt.toISOString(),
        updatedAt: pb.updatedAt?.toISOString() ?? null,
        shareToken,
      });
    };

    if (!since) {
      for (const c of contributors) {
        for (const pb of c.passbooks) pushPassbook(pb, c.shareToken);
      }
    }

    // ── Écritures : historique complet au premier appel, delta ensuite ──
    const collections = since
      ? await db.collection.findMany({
          where: { tenantId, agentId: user.id, receivedAt: { gt: since } },
          orderBy: { receivedAt: "asc" },
        })
      : await db.collection.findMany({
          where: { tenantId, agentId: user.id },
          orderBy: { collectedAt: "asc" },
        });

    // ── Delta : carnets à renvoyer ──
    // 1) carnets dont la LIGNE a changé (statut, surnom, fin de souscription…) ;
    // 2) carnets TOUCHÉS par les écritures du delta — le livret sérialisé
    //    rafraîchit le solde côté téléphone sans attendre un recalcul local.
    if (since) {
      const touchedIds = [...new Set(collections.map((c) => c.passbookId))];
      const deltaPassbooks = await db.passbook.findMany({
        where: {
          tenantId,
          agentId: user.id,
          OR: [
            { updatedAt: { gt: since } },
            { createdAt: { gt: since } },
            ...(touchedIds.length ? [{ id: { in: touchedIds } }] : []),
          ],
        },
        include: { contributor: true, collections: true },
        orderBy: { createdAt: "asc" },
      });
      for (const pb of deltaPassbooks) pushPassbook(pb, pb.contributor.shareToken);
    }

    // ── Clôture du jour (l'agent la voit avant de pousser) ──
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const closing = await db.closing.findFirst({ where: { tenantId, agentId: user.id, day: todayStart } });

    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const todayAll = await db.collection.findMany({
      where: { tenantId, agentId: user.id, collectedAt: { gte: todayStart, lt: todayEnd } },
    });
    const expectedCash = todayAll.filter((c) => c.method === "cash").reduce((s, c) => s + c.amount, 0);
    const mobileToday = todayAll.filter((c) => c.method === "mobile_money").reduce((s, c) => s + c.amount, 0);

    // Quartiers : mêmes règles de tri que la tournée du web.
    const neighborhoods = [...new Set(contributors.map((c) => c.neighborhood ?? ""))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "fr"));

    res.json({
      mode: since ? "delta" : "full",
      cursor,
      serverTime: now.toISOString(),
      device: {
        id: device.id,
        label: device.label,
        revokedAt: null,
        clockSkewMs: skewMs ?? device.clockSkewMs,
      },
      structure: { name: structure?.name ?? "", lateThreshold, slug, entityUrl: entityUrl(slug) },
      agent: { id: user.id, name: user.fullName, phone: user.phone },
      neighborhoods,
      contributors: contributors.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        phone: c.phone,
        email: c.email,
        neighborhood: c.neighborhood,
        status: c.status,
        shareToken: c.shareToken,
        shareUrl: c.shareToken ? carnetUrl(slug, c.shareToken) : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt?.toISOString() ?? null,
      })),
      passbooks: serializedPassbooks,
      collections: collections.map((c) => ({
        id: c.id,
        passbookId: c.passbookId,
        agentId: c.agentId,
        amount: c.amount,
        method: c.method,
        dayIndex: c.dayIndex,
        coversOn: c.coversOn?.toISOString() ?? null,
        collectedAt: c.collectedAt.toISOString(),
        receivedAt: c.receivedAt.toISOString(),
      })),
      summary: { expectedCash, mobileToday },
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

export default router;
