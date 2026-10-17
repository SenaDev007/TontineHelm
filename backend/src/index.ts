// TontiHelm — API de gestion de tontines journalières (YEHI OR Tech, Bénin).
// Backend Express autonome : déploiement Railway, base PostgreSQL (Neon),
// frontend Next.js déployé séparément sur Vercel.
const BUILD = "boot-v3 (double port + anti-crash)";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import structuresRoutes from "./routes/structures";
import adminRoutes from "./routes/admin";
import agentRoutes from "./routes/agent";
import managerRoutes from "./routes/manager";
import paymentsRoutes from "./routes/payments";
import publicRoutes from "./routes/public";
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
      const lines = (err instanceof Error ? err.message : String(err)).split("\n").map((l) => l.trim()).filter(Boolean);
      report.db = `injoignable — ${lines[0] ?? "erreur inconnue"}`;
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
// Carnets publics des cotisants : lien personnel partagé par WhatsApp / e-mail,
// consultation sans compte — accessible même si les autres routes changent.
app.use("/api/public", publicRoutes);

// 404 JSON uniforme pour toute route inconnue.
app.use((_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Route introuvable." } });
});

app.use(apiErrorHandler);

// ── Garde-fous de processus : ce process NE DOIT JAMAIS mourir. ──
// En production, un conteneur mort = 502 « Application failed to respond »
// sur tout le frontend (« Pas de réseau »). Toute erreur non interceptée est
// journalisée ; le process continue de servir les requêtes suivantes.
process.on("uncaughtException", (err) => {
  console.error("[tontihelm-api] uncaughtException — process maintenu en vie :", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[tontihelm-api] unhandledRejection — process maintenu en vie :", err);
});

// ── Écoute réseau : double port pour éliminer tout décalage de routage. ──
// Railway route le domaine vers le port applicatif ; selon le mode de build,
// ce peut être le PORT injecté OU le port EXPOSE du Dockerfile (3001).
// On écoute sur les DEUX : coût nul, et le 502 « fallback » devient
// impossible quelle que soit la configuration de routage de la plateforme.
console.log(
  `[tontihelm-api] ${BUILD} | démarrage` +
    ` | PORT env=${process.env.PORT ?? "absent"}` +
    ` | déploiement=${process.env.RAILWAY_DEPLOYMENT_ID ?? "hors Railway"}` +
    ` | DATABASE_URL=${process.env.DATABASE_URL ? "définie" : "ABSENTE"}` +
    ` | CORS=${corsOrigins.join(",") || "*"}`,
);
const ports = [...new Set([PORT, 3001])].filter((p) => p > 0);
for (const p of ports) {
  try {
    const server = app.listen(p, () => {
      console.log(
        `[tontihelm-api] à l'écoute sur le port ${p}` +
          (p === PORT ? " (PORT injecté)" : " (port par défaut Dockerfile)"),
      );
    });
    server.on("error", (err) => {
      console.error(`[tontihelm-api] port ${p} indisponible (ignoré) :`, err instanceof Error ? err.message : err);
    });
  } catch (err) {
    console.error(`[tontihelm-api] port ${p} indisponible (ignoré) :`, err instanceof Error ? err.message : err);
  }
}

export default app;
