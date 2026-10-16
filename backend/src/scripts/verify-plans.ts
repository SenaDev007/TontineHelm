// Contre-validation des paliers : passage temporaire d'Alafia Finance en Pro,
// vérification que les fonctionnalités Pro se débloquent, puis retour à Démarrage.
import { db } from "../lib/db";

async function main() {
  const structure = await db.structure.findFirst({ where: { name: "Alafia Finance" }, include: { subscription: true } });
  if (!structure || !structure.subscription) {
    console.error("structure ou abonnement introuvable");
    process.exit(1);
  }
  const sub = structure.subscription;

  // ── Passage en Pro ──
  await db.subscription.update({ where: { id: sub.id }, data: { plan: "pro" } });
  console.log("plan → pro");

  const { execSync } = await import("child_process");
  const base = "http://localhost:81/api";

  const sh = (cmd: string) => execSync(cmd, { encoding: "utf8" });
  const token = JSON.parse(sh(`curl -s -X POST '${base}/auth/login?XTransformPort=3001' -H 'Content-Type: application/json' -d '{"phone":"+22997123456","pin":"135790"}'`)).token;

  // Quota agents : 10 en Pro.
  const billing = JSON.parse(sh(`curl -s '${base}/manager/billing?XTransformPort=3001' -H 'Authorization: Bearer ${token}'`));
  console.log("usage Pro :", JSON.stringify({ agents: billing.usage.agents, agentsQuota: billing.usage.agentsQuota, contributorsQuota: billing.usage.contributorsQuota, remindersIncluded: billing.usage.remindersIncluded }));

  // Rappel : doit aboutir au palier Pro.
  const passbooks = JSON.parse(sh(`curl -s '${base}/manager/passbooks?XTransformPort=3001' -H 'Authorization: Bearer ${token}'`));
  const pb = passbooks.passbooks.find((p: { number: string }) => p.number === "0101");
  const remind = sh(`curl -s -X POST '${base}/manager/passbooks/${pb.id}/remind?XTransformPort=3001' -H 'Content-Type: application/json' -H 'Authorization: Bearer ${token}' -d '{}'`);
  console.log("rappel (Pro) :", remind.trim().slice(0, 220));

  // ── Retour à Démarrage (état de recette inchangé) ──
  await db.subscription.update({ where: { id: sub.id }, data: { plan: "demarrage" } });
  console.log("plan → demarrage (retour à l'état de recette)");

  const billing2 = JSON.parse(sh(`curl -s '${base}/manager/billing?XTransformPort=3001' -H 'Authorization: Bearer ${token}'`));
  console.log("usage après retour :", JSON.stringify({ agentsQuota: billing2.usage.agentsQuota, remindersIncluded: billing2.usage.remindersIncluded }));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
