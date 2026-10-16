// TontiHelm — client Prisma (PostgreSQL), instanciation paresseuse.
//
// Pourquoi un proxy paresseux ? Si DATABASE_URL est absente ou invalide,
// `new PrismaClient()` lève IMMÉDIATEMENT (au moment de l'import de ce
// fichier) : l'API ne démarre jamais, le conteneur Railway crash en
// boucle et le frontend n'affiche que « Pas de réseau » sans cause
// visible. Avec le proxy, le client n'est créé qu'au PREMIER usage
// effectif : l'API démarre toujours, /api/health répond et signale le
// problème de configuration en clair — on diagnostique au lieu de
// subir un crash silencieux.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });
}

// Proxy : toute propriété accédée (db.user, db.$queryRaw…) instancie
// d'abord le vrai client, puis délègue. Les erreurs de connexion
// remontent alors au niveau de la requête concernée — et uniquement là.
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    globalForPrisma.prisma ??= createClient();
    const client = globalForPrisma.prisma as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(globalForPrisma.prisma) : value;
  },
});
