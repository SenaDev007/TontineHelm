// TontiHelm — liens dédiés par entité + liens de carnet clients (2026-10).
// Chaque entité (PME, groupement, particulier) possède son PROPRE lien :
//   https://<frontend>/e/{slug}            — portail de l'entité (agents, gérants)
//   https://<frontend>/e/{slug}/carnet/{t}  — carnet d'un client de CETTE entité
// Le slug est généré à l'activation de la structure (et rétrofillé à la volée
// pour les structures plus anciennes). Les agents et les clients qui ouvrent le
// lien de l'entité restent rattachés à elle : plus de domaine générique affiché
// indifféremment pour tout le monde.
import { randomBytes } from "crypto";
import { db } from "./db";

/** URL publique du frontend — FRONTEND_URL en production, localhost en préproduction. */
export function frontendBaseUrl(): string {
  const raw = process.env.FRONTEND_URL?.trim();
  if (raw && /^https?:\/\//.test(raw)) return raw.replace(/\/+$/, "");
  return "http://localhost:3000";
}

/** Jeton personnel du cotisant : 24 caractères URL-sûrs, non énumérable. */
export function generateShareToken(): string {
  return randomBytes(18).toString("base64url");
}

// ── Slug d'entité ─────────────────────────────────────────────────────────────

/** Translittère les accents puis réduit aux caractères URL-sûrs. */
export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "structure";
}

/**
 * Garantit qu'une structure possède son slug (généré à l'activation ; les
 * structures plus anciennes le reçoivent à la première demande de lien).
 * Collision : suffixe numérique court.
 */
export async function ensureStructureSlug(tenantId: string): Promise<string> {
  const structure = await db.structure.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!structure) throw new Error("Structure introuvable.");
  if (structure.slug) return structure.slug;

  const base = slugify(structure.name);
  let candidate = base;
  for (let i = 2; i < 60; i += 1) {
    const clash = await db.structure.findFirst({ where: { slug: candidate }, select: { id: true } });
    if (!clash || clash.id === tenantId) break;
    candidate = `${base}-${i}`;
  }
  // Dernier recours (collision improbable) : jeton aléatoire court.
  const taken = await db.structure.findFirst({ where: { slug: candidate }, select: { id: true } });
  if (taken && taken.id !== tenantId) candidate = `${base}-${randomBytes(3).toString("hex")}`;

  await db.structure.update({ where: { id: tenantId }, data: { slug: candidate } });
  return candidate;
}

/** Lien dédié du portail de l'entité (à donner à ses agents et gérants). */
export function entityUrl(slug: string): string {
  return `${frontendBaseUrl()}/e/${slug}`;
}

/** Lien public du carnet d'un client, RATTACHÉ à son entité. */
export function carnetUrl(slug: string, token: string): string {
  return `${frontendBaseUrl()}/e/${slug}/carnet/${token}`;
}

/** Ancienne forme (compatibilité : les liens déjà partagés restent valables). */
export function legacyCarnetUrl(token: string): string {
  return `${frontendBaseUrl()}/carnet/${token}`;
}

/**
 * Garantit qu'un cotisant possède son jeton de partage (généré à la création ;
 * les cotisants plus anciens le reçoivent à la première demande de lien) et
 * renvoie l'URL prête à partager, portée par le lien dédié de SON entité.
 */
export async function ensureShareToken(contributorId: string): Promise<string> {
  const existing = await db.contributor.findUnique({
    where: { id: contributorId },
    select: { shareToken: true, tenantId: true },
  });
  const slug = await ensureStructureSlug(existing?.tenantId ?? "");
  if (existing?.shareToken) return carnetUrl(slug, existing.shareToken);
  // Boucle de réessai : extrêmement improbable, mais le jeton est unique.
  for (let i = 0; i < 3; i += 1) {
    const token = generateShareToken();
    const clash = await db.contributor.findUnique({ where: { shareToken: token }, select: { id: true } });
    if (clash) continue;
    await db.contributor.update({ where: { id: contributorId }, data: { shareToken: token } });
    return carnetUrl(slug, token);
  }
  throw new Error("Impossible de générer un jeton de partage.");
}

/** Message WhatsApp prêt à envoyer au cotisant avec son lien de carnet. */
export function shareMessage(params: {
  contributorName: string;
  structureName: string;
  url: string;
}): string {
  return (
    `Bonjour ${params.contributorName}, ` +
    `voici le lien de ton carnet de tontine (${params.structureName}) : ${params.url} — ` +
    `consulte ton évolution et tes versements à tout moment. Garde ce lien.`
  );
}

/** Lien wa.me pré-rempli (ouvre WhatsApp sur le bon numéro avec le message). */
export function whatsappShareUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Lien mailto pré-rempli pour l'envoi du lien par courriel. */
export function mailShareUrl(email: string, subject: string, message: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}
