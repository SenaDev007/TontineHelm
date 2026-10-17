// TontiHelm — GET /v1/events : flux SSE temps réel du canal MOBILE (2026-10-18).
// Symétrique de /api/events (web) : mêmes événements, mêmes règles — jeton
// d'appareil mobile (Authorization Bearer, pose d'en-tête possible en XHR).
// L'app Android consomme ce flux par XHR incrémental (React Native n'expose
// pas EventSource) et retombe sur le pull delta périodique hors ligne.
import { Router } from "express";
import { h } from "../../lib/auth";
import { requireMobileUser } from "../../lib/mobile-auth";
import { openTenantStream } from "../../lib/events";

const router = Router();

router.get(
  "/",
  h(async (req, res) => {
    const { user } = await requireMobileUser(req);
    openTenantStream(req, res, user.tenantId);
  })
);

export default router;
