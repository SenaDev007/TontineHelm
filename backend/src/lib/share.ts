// TontiHelm — liens de carnet clients (remplacent les reçus SMS).
// Chaque cotisant reçoit un lien personnel, permanent, partagé par WhatsApp
// ou par e-mail : il y consulte son carnet et son évolution à tout moment,
// sans compte ni mot de passe.
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

/** Lien public du carnet d'un cotisant. */
export function carnetUrl(token: string): string {
  return `${frontendBaseUrl()}/carnet/${token}`;
}

/**
 * Garantit qu'un cotisant possède son jeton de partage (généré à la création
 * depuis 2026-10 ; les cotisants plus anciens le reçoivent à la première
 * demande de lien) et renvoie l'URL prête à partager.
 */
export async function ensureShareToken(contributorId: string): Promise<string> {
  const existing = await db.contributor.findUnique({
    where: { id: contributorId },
    select: { shareToken: true },
  });
  if (existing?.shareToken) return carnetUrl(existing.shareToken);
  // Boucle de réessai : extrêmement improbable, mais le jeton est unique.
  for (let i = 0; i < 3; i += 1) {
    const token = generateShareToken();
    const clash = await db.contributor.findUnique({ where: { shareToken: token }, select: { id: true } });
    if (clash) continue;
    await db.contributor.update({ where: { id: contributorId }, data: { shareToken: token } });
    return carnetUrl(token);
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
