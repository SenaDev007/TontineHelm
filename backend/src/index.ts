// TontiHelm — API de gestion de tontines journalières (YEHI OR Tech, Bénin).
// Backend Express autonome : déploiement Railway, base PostgreSQL (Neon),
// frontend Next.js déployé séparément sur Vercel.
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import structuresRoutes from "./routes/structures";
import adminRoutes from "./routes/admin";
import agentRoutes from "./routes/agent";
import managerRoutes from "./routes/manager";
import paymentsRoutes from "./routes/payments";
import demoRoutes from "./routes/demo";
import { apiErrorHandler, getCurrentUser } from "./lib/auth";
import { db } from "./lib/db";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// ── CORS : le frontend (Vercel) appelle l'API (Railway) avec identifiants. ──
// Normalisation : espaces et barres finales retirées (une barre finale dans
// CORS_ORIGINS est une erreur fréquente qui bloque silencieusement le navigateur).
const corsOrigins = (process.env.CORS_ORIGINS ?? "*")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const corsOptions: cors.CorsOptions = {
  origin: corsOrigins.includes("*") ? true : corsOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
};
app.use(cors(corsOptions));

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// ── Santé et diagnostic : probe Railway + état de la configuration. ──
// Répond TOUJOURS 200 tant que le processus vit (le healthcheck Railway valide
// la disponibilité du service, pas celle de la base) et détaille :
//   · db           : « ok » ou l'erreur exacte de connexion (message tronqué) ;
//   · config       : présence de DATABASE_URL / ADMIN_*, valeur de CORS_ORIGINS.
// En cas de problème en production, ouvre /api/health dans le navigateur :
// la cause y est écrite en clair.
app.get("/api/health", async (_req, res) => {
  const report: Record<string, unknown> = {
    ok: true,
    service: "tontihelm-api",
    time: new Date().toISOString(),
    config: {
      databaseUrl: process.env.DATABASE_URL ? "définie" : "ABSENTE",
      corsOrigins: corsOrigins.join(",") || "* (tout le monde)",
      adminPhone: process.env.ADMIN_PHONE ? "défini" : "absent",
    },
  };
  if (process.env.DATABASE_URL) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout après 3 s")), 3000);
      });
      await Promise.race([db.$queryRaw`SELECT 1`, timeout]);
      report.db = "ok";
    } catch (err) {
      report.db = `injoignable — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`;
    } finally {
      if (timer) clearTimeout(timer);
    }
  } else {
    report.db = "DATABASE_URL absente — les routes de données renverront une erreur 500";
  }
  res.json(report);
});

// ── Montage des routes. ──
app.use("/api/auth", authRoutes);
app.use("/api/structures", structuresRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/demo", demoRoutes);

// 404 JSON uniforme pour toute route inconnue.
app.use((_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Route introuvable." } });
});

app.use(apiErrorHandler);

app.listen(PORT, () => {
  console.log(`[tontihelm-api] à l'écoute sur le port ${PORT}`);
});

export default app;
