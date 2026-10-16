// TontiHelm — amorce du compte administrateur plateforme (YEHI OR Tech).
// Crée ou met à jour l'admin à partir des variables d'environnement :
//   ADMIN_PHONE (ex : +22990000001)  ADMIN_PIN (6 chiffres)
// Idempotent : réexécutable sans risque, le PIN est simplement réinitialisé.
// Exécution : bun src/scripts/bootstrap-admin.ts
import { db } from "../lib/db";
import { hashPin } from "../lib/auth";

async function main() {
  const phone = (process.env.ADMIN_PHONE ?? "").replace(/\s+/g, "");
  const pin = process.env.ADMIN_PIN ?? "";
  if (!/^\+?\d{8,15}$/.test(phone)) {
    console.error("ADMIN_PHONE manquant ou invalide (ex : +22990000001).");
    process.exit(1);
  }
  if (!/^\d{6}$/.test(pin)) {
    console.error("ADMIN_PIN manquant ou invalide (6 chiffres).");
    process.exit(1);
  }

  const existing = await db.user.findUnique({ where: { phone } });
  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: { role: "admin", status: "active", pinHash: hashPin(pin), tenantId: null },
    });
    console.log(`Compte admin mis à jour : ${phone}`);
  } else {
    await db.user.create({
      data: {
        phone,
        fullName: "Administrateur TontiHelm",
        role: "admin",
        status: "active",
        pinHash: hashPin(pin),
      },
    });
    console.log(`Compte admin créé : ${phone}`);
  }
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
