// TontiHelm — carnet public du cotisant (sans compte).
// Le cotisant consulte son carnet depuis le lien personnel partagé par
// WhatsApp ou e-mail : évolution du cycle, journées versées, solde, statut.
// Aucune donnée sensible (ni pièce d'identité, ni numéro d'agent) n'y figure.
import { Router } from "express";
import { db } from "../lib/db";
import { ApiError, h } from "../lib/auth";
import { passbookBalance, paidDays, missedDays, elapsedDays, isLate, buildDayLedger } from "../lib/domain";

const router = Router();

// Anti-abus rudimentaire en mémoire : 60 consultations par IP sur 10 minutes.
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const list = (hits.get(ip) ?? []).filter((t) => now - t < window);
  if (list.length >= 60) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}

// ── GET /api/public/carnets/:token — carnet(s) du cotisant, sans authentification. ──
router.get(
  "/carnets/:token",
  h(async (req, res) => {
    const token = String(req.params.token ?? "");
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      throw new ApiError("not_found", "Lien de carnet inconnu.", 404);
    }
    if (rateLimited(req.ip ?? "anonymous")) {
      throw new ApiError("rate_limited", "Trop de consultations. Réessaie dans quelques minutes.", 429);
    }

    const contributor = await db.contributor.findUnique({
      where: { shareToken: token },
      include: {
        passbooks: {
          orderBy: { createdAt: "desc" },
          include: { collections: { orderBy: { collectedAt: "asc" } } },
        },
      },
    });
    if (!contributor) {
      throw new ApiError("not_found", "Lien de carnet inconnu ou plus valide.", 404);
    }

    const structure = await db.structure.findUnique({
      where: { id: contributor.tenantId },
      select: { name: true, lateThreshold: true },
    });
    const lateThreshold = structure?.lateThreshold ?? 3;

    const passbooks = contributor.passbooks.map((pb) => {
      const balance = passbookBalance(pb.collections);
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
      const late = isLate(pb, balance, lateThreshold);
      return {
        number: pb.number,
        dailyAmount: pb.dailyAmount,
        cycleDays: pb.cycleDays,
        startsOn: pb.startsOn.toISOString().slice(0, 10),
        status: late && pb.status === "active" ? "late" : pb.status,
        statusLabel: late && pb.status === "active"
          ? "En retard"
          : pb.status === "active"
            ? "À jour"
            : pb.status === "closed"
              ? "Terminé"
              : pb.status === "withdrawn"
                ? "Retiré"
                : pb.status,
        balance,
        paidDays: paidDays(balance, pb.dailyAmount),
        missedDays: missedDays(pb, balance),
        elapsedDays: Math.min(elapsedDays(pb, new Date()), pb.cycleDays),
        cycleTotal: pb.dailyAmount * pb.cycleDays,
        days: ledger.map((d) => ({ date: d.date.toISOString().slice(0, 10), net: d.net })),
      };
    });

    res.set("Cache-Control", "no-store");
    res.json({
      structure: { name: structure?.name ?? "" },
      contributor: { fullName: contributor.fullName, neighborhood: contributor.neighborhood ?? null },
      passbooks,
      generatedAt: new Date().toISOString(),
    });
  })
);

export default router;
