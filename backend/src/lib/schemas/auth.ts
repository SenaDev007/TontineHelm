// TontiHelm — schémas d'authentification mobile et d'appareils (phase 1, PARITE.md §8.5/§8.7).
// Le canal web (`/api/auth/*`, session opaque 30 jours, PIN scrypt) n'est PAS
// touché : ces contrats ne décrivent que le canal mobile /v1.
import { z } from "zod";
import { DeviceLabelSchema } from "./common";

/** `POST /v1/auth/login` — téléphone + PIN 6 chiffres (+ appareil connu le cas échéant). */
export const MobileLoginSchema = z.object({
  phone: z.string().min(8, "Numéro invalide. Saisis ton numéro complet, sans espace."),
  pin: z.string().regex(/^\d{6}$/, "Code PIN à 6 chiffres."),
  /** Identifiant d'appareil attribué par le serveur (cuid) — renvoyé par le téléphone à chaque connexion. */
  deviceId: z.string().min(1, "Appareil invalide.").optional(),
  /** Nom lisible de l'appareil, obligatoire pour un NOUVEL enregistrement. */
  deviceLabel: DeviceLabelSchema.optional(),
});
export type MobileLoginRequest = z.infer<typeof MobileLoginSchema>;

/** `POST /v1/auth/otp/verify` — code reçu par SMS (enregistrement d'appareil ou 2FA). */
export const OtpVerifySchema = z.object({
  challengeId: z.string().min(1, "Demande de code introuvable. Reconnecte-toi."),
  code: z.string().regex(/^\d{6}$/, "Code à 6 chiffres."),
  deviceLabel: DeviceLabelSchema.optional(),
});
export type OtpVerifyRequest = z.infer<typeof OtpVerifySchema>;

/** `POST /v1/auth/refresh` — rotation du jeton de renouvellement (30 jours). */
export const RefreshSchema = z.object({
  refreshToken: z.string().min(20, "Jeton de renouvellement invalide."),
});
export type RefreshRequest = z.infer<typeof RefreshSchema>;

/** `POST /v1/auth/logout` — révoque le jeton présenté (l'appareil reste enregistré). */
export const LogoutSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});
export type LogoutRequest = z.infer<typeof LogoutSchema>;

/** Utilisateur vu par le mobile — mêmes champs que `/api/auth/login`. */
export const MobileUserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  fullName: z.string(),
  role: z.enum(["owner", "manager", "agent", "controller", "admin"]),
  tenantId: z.string().nullable(),
  structureName: z.string().nullable(),
  structureKind: z.string().nullable(),
  structureStatus: z.string().nullable(),
});
export type MobileUser = z.infer<typeof MobileUserSchema>;

/** Appareil tel que listé par `GET /v1/devices`. */
export const DeviceDtoSchema = z.object({
  id: z.string(),
  label: z.string(),
  registeredAt: z.string(),
  lastSyncAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  clockSkewMs: z.number().int().nullable(),
  /** Vrai pour l'appareil qui effectue la requête. */
  current: z.boolean().optional(),
});
export type DeviceDto = z.infer<typeof DeviceDtoSchema>;

/** Paire de jetons renvoyée à la connexion / vérification OTP / rotation. */
export const TokenPairSchema = z.object({
  /** Jeton d'accès signé (validité 15 minutes, PARITE.md §8.7). */
  accessToken: z.string(),
  accessTokenExpiresAt: z.string(),
  /** Jeton de renouvellement opaque (rotation à 30 jours, lié à l'appareil). */
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.string(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;
