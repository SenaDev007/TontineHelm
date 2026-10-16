// État de recette : structures, abonnements, utilisateurs.
import { db } from "../lib/db";

async function main() {
  const structures = await db.structure.findMany({
    include: { subscription: true, _count: { select: { users: true, contributors: true } } },
  });
  for (const s of structures) {
    const agents = await db.user.count({ where: { tenantId: s.id, role: "agent" } });
    console.log(
      `structure ${s.name} [${s.status}] licenseRef=${s.licenseRef ?? "—"} users=${s._count.users} (agents=${agents}) contributors=${s._count.contributors} plan=${s.subscription?.plan ?? "aucun"} (${s.subscription?.status ?? "—"})`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
