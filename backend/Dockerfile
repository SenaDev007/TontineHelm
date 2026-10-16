# TontiHelm — image API (Bun + Express + Prisma + PostgreSQL) pour Railway.
#
# Pourquoi un Dockerfile ? Nixpacks v1.41 épingle un jeu nixpkgs dans lequel
# nodejs_18 a été retiré (fin de vie), ce qui fait échouer le build :
#   error: Node.js 18.x has reached End-Of-Life and has been removed
# L'image officielle Bun évite complètement nixpkgs et reproduit exactement
# les mêmes étapes que le plan Nixpacks (bun install → prisma generate → bun src).

FROM oven/bun:1
WORKDIR /app

# Prisma (moteurs Debian) + certificats CA pour la connexion TLS à Neon.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 1) Dépendances + client Prisma — couche cachée si package.json / bun.lock /
#    prisma/ sont inchangés entre deux builds.
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install && bunx prisma generate

# 2) Code applicatif — seule cette couche change à chaque commit.
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
# Railway injecte PORT ; src/index.ts écoute dessus (3001 par défaut ailleurs).
EXPOSE 3001

# ── Démarrage auto-réparant ──
# 1. `prisma db push` crée/synchronise les tables dans PostgreSQL (idempotent :
#    base vide → tables créées ; base à jour → rien ne bouge). Tolérant : s'il
#    échoue (DATABASE_URL invalide…), l'API démarre quand même et /api/health
#    signale le problème en clair.
# 2. `bootstrap-admin` amorce le compte admin (ADMIN_PHONE/ADMIN_PIN) —
#    idempotent également ; ignoré si les variables ne sont pas définies.
# 3. L'API démarre enfin (exec : le process Express devient PID principal,
#    les signaux Railway — arrêt/redéploiement — lui parviennent directement).
CMD ["sh", "-c", "bunx prisma db push --skip-generate || echo '[startup] prisma db push a échoué (vérifie DATABASE_URL) — le service démarre quand même'; bun src/scripts/bootstrap-admin.ts || echo '[startup] admin non amorcé (ADMIN_PHONE / ADMIN_PIN absents ou invalides)'; exec bun src/index.ts"]
