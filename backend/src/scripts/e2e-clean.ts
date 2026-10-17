// TontiHelm — nettoyage des données des tests E2E (clients, livret annuel…).
// Supprime les structures de test et tout ce qui s'y rattache (idempotent).
// Usage : cd backend && DATABASE_URL="file:dev.db" bun src/scripts/e2e-clean.ts
import { db } from "../lib/db";

const NAMES = ["Flux Clients E2E", "Livret Annuel E2E", "Avance Reste E2E"];

async function main() {
  const structures = await db.structure.findMany({ where: { name: { in: NAMES } } });
  for (const s of structures) {
    await db.session.deleteMany({ where: { user: { tenantId: s.id } } });
    await db.collection.deleteMany({ where: { tenantId: s.id } });
    await db.closing.deleteMany({ where: { tenantId: s.id } });
    await db.payment.deleteMany({ where: { tenantId: s.id } });
    await db.notification.deleteMany({ where: { tenantId: s.id } });
    await db.auditLog.deleteMany({ where: { tenantId: s.id } });
    await db.passbook.deleteMany({ where: { tenantId: s.id } });
    await db.planEvent.deleteMany({ where: { tenantId: s.id } });
    await db.contributor.deleteMany({ where: { tenantId: s.id } });
    await db.subscription.deleteMany({ where: { tenantId: s.id } });
    await db.invoice.deleteMany({ where: { tenantId: s.id } });
    await db.user.deleteMany({ where: { tenantId: s.id } });
    await db.structure.delete({ where: { id: s.id } });
    console.log(`structure de test supprimée : ${s.name} (${s.id})`);
  }
  const drafts = await db.signupPayment.deleteMany({
    where: { structureId: null, draft: { contains: "E2E" } },
  });
  console.log(`brouillons d'inscription obsolètes : ${drafts.count}`);
}

main()
  .catch((err) => {
    console.error("erreur nettoyage :", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect?.());
