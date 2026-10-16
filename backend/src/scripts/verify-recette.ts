// Vérification de recette : SMS récapitulatif groupé + chaîne d'audit intacte.
// À exécuter depuis backend/ : bun run src/scripts/verify-recette.ts
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3001";

async function login(phone: string, pin: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, pin }),
  });
  return ((await res.json()) as { token: string }).token;
}

async function main() {
  const ownerToken = await login("+22997123456", "135790");

  const auditRes = await fetch(`${BASE}/api/manager/audit?page=1`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  const audit = (await auditRes.json()) as { chainOk: boolean; total: number };
  console.log("chaîne d'audit :", audit.chainOk ? "INTACTE" : "ROMPUE", "—", audit.total, "lignes");

  const db = new PrismaClient();
  const notifs = await db.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { content: true, createdAt: true },
  });
  for (const n of notifs) console.log(`SMS [${n.createdAt.toISOString().slice(11, 16)}] :`, n.content);
  await db.$disconnect();
}

main().catch((e) => {
  console.error("échec:", e instanceof Error ? e.message : e);
  process.exit(1);
});
