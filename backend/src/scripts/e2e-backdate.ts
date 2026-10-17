// TontiHelm — outil de test E2E : recule la date de création d'un carnet pour
// simuler une arrivée antérieure (le retard court depuis la date d'arrivée
// réelle du cotisant — effectiveStart = max(1er du mois, createdAt)).
// Usage : DATABASE_URL="file:dev.db" bun src/scripts/e2e-backdate.ts <passbookId> <jours>
import { db } from "../lib/db";

async function main() {
  const [id, days] = process.argv.slice(2);
  if (!id || !days) {
    console.error("usage : bun src/scripts/e2e-backdate.ts <passbookId> <jours>");
    process.exit(1);
  }
  const back = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
  const pb = await db.passbook.update({
    where: { id },
    data: { createdAt: back },
  });
  console.log(`carnet ${pb.number} : arrivée reculée à ${back.toISOString().slice(0, 10)} (${days} jours)`);
}

main()
  .catch((err) => {
    console.error("erreur :", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect?.());
