// TontiHelm — schémas communs (phase 1 mobile, PARITE.md §8).
// Contraintes volontairement alignées OCTET POUR OCTET sur celles du web
// (`backend/src/routes/agent.ts`, `auth.ts`) : mêmes expressions, mêmes
// messages en français, pour que /v1 et /api rejettent à l'identique.
import { z } from "zod";

/** UUID quelconque — même garde que le fil /api/agent/sync (`z.string().uuid()`). */
export const UuidSchema = z.string().uuid("Identifiant invalide.");

/**
 * UUID **v7** — imposé côté téléphone pour les identifiants d'encaissements
 * (PARITE.md §5 ligne 7, §8.2) : triables par temps, index SQLite efficaces.
 * Le fil serveur accepte tout UUID (règle de compatibilité web) ; ce schéma
 * strict sert à l'application mobile pour valider SES propres événements
 * avant même de les mettre en file d'envoi.
 */
export const UuidV7Schema = z
  .string()
  .uuid("Identifiant invalide.")
  .refine(
    (s) => {
      const version = Number.parseInt(s[14], 16);
      const variant = Number.parseInt(s[19], 16);
      return version === 7 && (variant & 0xc) === 0x8;
    },
    { message: "Identifiant invalide (UUID v7 attendu côté téléphone)." }
  );

/** Horodatage ISO 8601 avec décalage (ex. 2026-10-18T09:30:00+01:00). */
export const DateTimeOffsetSchema = z.string().datetime({ offset: true });

/** Journée calendaire couverte (coversOn) : AAAA-MM-JJ. */
export const DaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Journée couverte invalide (format AAAA-MM-JJ attendu).");

/** Montant en FCFA : entier non nul (les annulations sont des écritures négatives). */
export const AmountFcfaSchema = z.number().int().refine((n) => n !== 0, "Montant invalide.");

/** Enveloppe d'erreur unique de l'API : `{ error: { code, message } }`. */
export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorShape = z.infer<typeof ApiErrorSchema>;

/**
 * Normalisation béninoise d'un numéro saisi — RÈGLE DU WEB (`/api/auth/login`) :
 * espaces/points/tirets/parenthèses retirés, puis essai TEL QUEL et avec le
 * préfixe international +229 (une saisie locale « 97123456 » devient
 * « +22997123456 »). Renvoie les candidates dans l'ordre d'essai du web.
 */
export function normalizePhoneBenin(raw: string): string[] {
  const cleaned = raw.replace(/[\s.\-()]/g, "");
  if (cleaned.startsWith("+") || cleaned.startsWith("00")) {
    return [cleaned.replace(/^00/, "+")];
  }
  return [cleaned, `+229${cleaned}`];
}

/** Nom d'appareil lisible, saisi à l'enregistrement (« Samsung A15 de Yao »). */
export const DeviceLabelSchema = z
  .string()
  .min(2, "Nomme l'appareil pour le reconnaître (p. ex. « Samsung A15 de Yao »).")
  .max(80, "Le nom de l'appareil est trop long (80 caractères maximum).");
