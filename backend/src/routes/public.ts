// TontiHelm — carnet public du cotisant (consultation par lien personnel) et
// signature numérique de fin de souscription (2026-10).
// Le cotisant ouvre ce lien depuis WhatsApp ou son e-mail : il voit son LIVRET
// ANNUEL — 12 feuilles mensuelles (31 lignes, la 31e = mise de l'entreprise,
// champs avance/reste) + la 13e feuille de récapitulatif — et l'évolution de
// ses versements en temps réel, sans compte ni code. Lorsque la structure a
// préparé la remise de fin de souscription, il SIGNe ici (tracé + nom) pour
// certifier qu'il a fini de cotiser et pris son argent : le carnet est alors
// archivé automatiquement. Aucune donnée sensible n'y figure.
import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { ApiError, h } from "../lib/auth";
import { appendAudit } from "../lib/audit";
import { passbookBalance, formatFCFA } from "../lib/domain";
import { buildLivret, serializeLivret } from "../lib/livret";

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

// ── GET /api/public/entities/:slug — identité publique d'une entité (portail /e/{slug}). ──
// Sert au branding du portail de connexion propre à chaque PME/particulier et
// des pages de carnet rattachées : nom uniquement, aucune donnée sensible.
router.get(
  "/entities/:slug",
  h(async (req, res) => {
    const slug = String(req.params.slug ?? "");
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
      throw new ApiError("not_found", "Entité inconnue.", 404);
    }
    const structure = await db.structure.findUnique({
      where: { slug },
      select: { name: true, kind: true, city: true, status: true },
    });
    if (!structure || structure.status === "closed") {
      throw new ApiError("not_found", "Entité inconnue.", 404);
    }
    res.set("Cache-Control", "public, max-age=300");
    res.json({
      name: structure.name,
      kind: structure.kind,
      city: structure.city,
    });
  })
);

// ── GET /api/public/carnets/:token — livret(s) du cotisant, sans authentification. ──
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
      select: { name: true, lateThreshold: true, slug: true },
    });
    const lateThreshold = structure?.lateThreshold ?? 3;

    const passbooks = contributor.passbooks.map((pb) => {
      const balance = passbookBalance(pb.collections);
      const livret = buildLivret(pb, balance);
      const late = pb.status === "active" && livret.missedLines >= lateThreshold;
      return {
        id: pb.id,
        number: pb.number,
        label: pb.label,
        dailyAmount: pb.dailyAmount,
        startsOn: livret.startsOn,
        status: late ? "late" : pb.status,
        statusLabel: late
          ? "En retard"
          : pb.status === "active"
            ? "À jour"
            : pb.status === "closing"
              ? "Remise en cours — à signer"
              : pb.status === "completed"
                ? "Terminé et signé"
                : pb.status === "withdrawn"
                  ? "Retiré"
                  : "Clos",
        balance,
        coveredLines: livret.coveredLines,
        missedLines: livret.missedLines,
        livret: serializeLivret(livret),
        completion: {
          pending: pb.status === "closing",
          completedAt: pb.completedAt,
          payoutAmount: pb.status === "closing" || pb.status === "completed" ? pb.payoutAmount : null,
          companyAmount: pb.status === "closing" || pb.status === "completed" ? pb.companyAmount : null,
          signedAt: pb.signedAt,
          signatureName: pb.signatureName,
        },
      };
    });

    res.set("Cache-Control", "no-store");
    res.json({
      structure: { name: structure?.name ?? "", slug: structure?.slug ?? null },
      contributor: { fullName: contributor.fullName, neighborhood: contributor.neighborhood ?? null },
      passbooks,
      generatedAt: new Date().toISOString(),
    });
  })
);

// ── POST /api/public/carnets/:token/sign — signature numérique de fin de souscription. ──
// Le client certifie sur SON lien (détenu uniquement par lui) qu'il a fini de
// cotiser et a pris son argent : le carnet passe « completed » et est archivé
// automatiquement (module Archive : année, quartier, client).
const signSchema = z.object({
  passbookId: z.string().min(1),
  name: z.string().min(2, "Saisis ton nom complet pour certifier.").max(80),
  signature: z
    .string()
    .refine((s) => s.startsWith("data:image/png;base64,") || s === "", "Signature invalide.")
    .refine((s) => s.length <= 120_000, "Signature trop volumineuse."),
});

router.post(
  "/carnets/:token/sign",
  h(async (req, res) => {
    const token = String(req.params.token ?? "");
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      throw new ApiError("not_found", "Lien de carnet inconnu.", 404);
    }
    if (rateLimited(req.ip ?? "anonymous")) {
      throw new ApiError("rate_limited", "Trop de tentatives. Réessaie dans quelques minutes.", 429);
    }

    const body = signSchema.safeParse(req.body ?? {});
    if (!body.success) {
      const issue = body.error.issues[0]?.message ?? "Signature invalide.";
      throw new ApiError("invalid_input", issue);
    }

    const contributor = await db.contributor.findUnique({
      where: { shareToken: token },
      select: { id: true, tenantId: true, fullName: true },
    });
    if (!contributor) {
      throw new ApiError("not_found", "Lien de carnet inconnu ou plus valide.", 404);
    }

    const passbook = await db.passbook.findFirst({
      where: { id: body.data.passbookId, contributorId: contributor.id },
      include: { collections: true },
    });
    if (!passbook) {
      throw new ApiError("not_found", "Carnet introuvable sur ce lien.", 404);
    }
    if (passbook.status === "completed") {
      throw new ApiError("already_signed", "Ce carnet est déjà signé et archivé.", 409);
    }
    if (passbook.status !== "closing") {
      throw new ApiError(
        "bad_state",
        "La remise de ce carnet n'a pas encore été préparée par ta structure. Contacte ton agent.",
        409
      );
    }

    const now = new Date();
    await db.passbook.update({
      where: { id: passbook.id },
      data: {
        status: "completed",
        completedAt: now,
        signedAt: now,
        signatureName: body.data.name,
        signatureData: body.data.signature || null,
      },
    });
    await appendAudit({
      tenantId: contributor.tenantId,
      actorId: null,
      action: "passbook_signed",
      entity: "passbook",
      entityId: passbook.id,
      payload: {
        number: passbook.number,
        contributor: contributor.fullName,
        signedBy: body.data.name,
        payoutAmount: passbook.payoutAmount,
        companyAmount: passbook.companyAmount,
        hasDrawing: Boolean(body.data.signature),
        archived: true,
      },
      at: now,
    });

    res.json({
      ok: true,
      message:
        `Merci ${body.data.name} ! Tu as certifié avoir fini ta souscription et pris ton argent ` +
        `(${formatFCFA(passbook.payoutAmount ?? 0)}). Ce carnet est maintenant archivé — garde ton lien, ` +
        `il reste ta preuve.`,
      passbook: { id: passbook.id, number: passbook.number, status: "completed", completedAt: now },
    });
  })
);

export default router;
