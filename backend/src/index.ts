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

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// ── CORS : le frontend (Vercel) appelle l'API (Railway) avec identifiants. ──
const corsOrigins = (process.env.CORS_ORIGINS ?? "*")
  .split(",")
  .map((s) => s.trim())
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

// ── Santé et version : probe Railway + vérification de déploiement. ──
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "tontihelm-api", time: new Date().toISOString() });
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
