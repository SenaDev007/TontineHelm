// TontiHelm — inscription d'une structure (M1).
// L'agrément et le justificatif sont FACULTATIFS à l'inscription : la vérification
// réglementaire se fait au moment de la validation par l'administrateur.
import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { hashPin, errorResponse, ApiError, h } from "../lib/auth";

const router = Router();

const registerSchema = z.object({
  structureName: z.string().min(2, "Saisis le nom de ta structure."),
  kind: z.enum(["sfd", "groupement", "pme"]),
  licenseRef: z.string().trim().optional(),
  licenseDocName: z.string().optional(),
  city: z.string().min(2, "Saisis ta ville."),
  ownerName: z.string().min(2, "Saisis ton nom complet."),
  ownerPhone: z.string().regex(/^\+?\d{8,15}$/, "Numéro invalide. Saisis ton numéro complet, sans espace."),
  pin: z.string().regex(/^\d{6}$/, "Code PIN à 6 chiffres."),
});

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

    const structure = await db.structure.create({
      data: {
        name: data.structureName,
        kind: data.kind,
        licenseRef: data.licenseRef || null,
        licenseDocName: data.licenseDocName || null,
        city: data.city,
        status: "pending",
      },
    });
    await db.user.create({
      data: {
        tenantId: structure.id,
        phone: ownerPhone,
        fullName: data.ownerName,
        role: "owner",
        pinHash: hashPin(data.pin),
      },
    });

    res.json({
      ok: true,
      message:
        "Demande reçue. Nous vérifions les informations de ta structure et nous te répondons sous 24 heures ouvrées.",
    });
  })
);

export default router;
