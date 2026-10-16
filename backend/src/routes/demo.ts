// TontiHelm — demandes de démonstration (vitrine) : formulaire public, sans compte.
// Il n'existe pas de mode gratuit : la découverte du produit passe par une
// démonstration accompagnée, demandée depuis le site vitrine.
import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { ApiError, h } from "../lib/auth";

const router = Router();

const demoSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^\+?[0-9]{8,15}$/),
  structure: z.string().trim().min(2).max(160),
  city: z.string().trim().max(80).optional(),
  contributors: z.number().int().min(0).max(200000).optional(),
  agents: z.number().int().min(0).max(2000).optional(),
  message: z.string().trim().max(600).optional(),
});

// Anti-abus rudimentaire en mémoire : 5 demandes par IP sur 10 minutes.
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const list = (hits.get(ip) ?? []).filter((t) => now - t < window);
  if (list.length >= 5) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}

// ── POST /api/demo/request — enregistrer une demande de démonstration. ──
router.post(
  "/request",
  h(async (req, res) => {
    const parsed = demoSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(
        "invalid_input",
        "Formulaire incomplet. Vérifie ton nom, ton numéro et le nom de ta structure."
      );
    }
    const ip = req.ip ?? "anonymous";
    if (rateLimited(ip)) {
      throw new ApiError("rate_limited", "Trop de demandes. Réessaie dans quelques minutes.", 429);
    }
    const data = parsed.data;
    await db.demoRequest.create({
      data: {
        fullName: data.fullName,
        phone: data.phone,
        structure: data.structure,
        city: data.city || null,
        contributors: data.contributors ?? null,
        agents: data.agents ?? null,
        message: data.message || null,
      },
    });
    res
      .status(201)
      .json({ ok: true, message: "Demande reçue. Nous te contactons sous 24 heures ouvrées." });
  })
);

export default router;
