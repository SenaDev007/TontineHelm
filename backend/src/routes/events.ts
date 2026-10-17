// TontiHelm — GET /api/events : flux SSE temps réel du canal WEB (2026-10-18).
// Tout ce qui est fait (encaissement web, encaissement mobile, clôture validée)
// est poussé ici aux navigateurs connectés de la structure : l'application
// rafraîchit alors ses données — plus besoin d'actualiser la page.
// Authentification : session web ordinaire (cookie httpSameSite, en-tête Bearer
// ou ?token= — EventSource ne peut pas poser d'en-tête).
import { Router } from "express";
import { requireUser, h } from "../lib/auth";
import { openTenantStream } from "../lib/events";

const router = Router();

router.get(
  "/",
  h(async (req, res) => {
    const user = await requireUser(req);
    // Un compte sans structure (admin plateforme) reçoit le flux mais aucun
    // événement de tenant — l'authentification reste obligatoire.
    openTenantStream(req, res, user.tenantId);
  })
);

export default router;
