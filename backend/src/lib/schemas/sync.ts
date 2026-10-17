// TontiHelm — schémas de synchronisation mobile /v1 (phase 1, PARITE.md §8.2/§8.3).
// Le contrat du fil reprend EXACTEMENT les gardes du web (`POST /api/agent/sync`) :
// lot de 50 maximum, UUID, montant entier non nul, méthode espèces/mobile money,
// journée couverte AAAA-MM-JJ facultative, horodatage avec décalage. S'y ajoutent
// les compléments téléphone du brief (§8.4) : deviceId et horloge client,
// tolérés donc sans effet sur le canal web.
import { z } from "zod";
import { AmountFcfaSchema, DaySchema, DateTimeOffsetSchema, UuidSchema } from "./common";

/** Un événement d'encaissement prêt à partir de la file d'envoi du téléphone. */
export const SyncEventSchema = z.object({
  /** UUID v7 généré par le téléphone (le fil serveur accepte tout UUID). */
  id: z.string().uuid("Identifiant d'événement invalide."),
  passbookId: z.string().min(1),
  amount: AmountFcfaSchema,
  method: z.enum(["cash", "mobile_money"]),
  advance: z.boolean().optional().default(false),
  coversOn: DaySchema.optional().nullable(),
  collectedAt: DateTimeOffsetSchema,
  /** Compléments mobiles (§8.4) — facultatifs, le serveur garde l'appareil du jeton comme référence. */
  deviceId: z.string().min(1).optional(),
  clientTime: DateTimeOffsetSchema.optional(),
});
export type SyncEvent = z.infer<typeof SyncEventSchema>;

/** Lot poussé vers `POST /v1/sync/push` (même plafond que le web : 50). */
export const SyncPushSchema = z.object({
  events: z.array(SyncEventSchema).max(50, "Lot trop volumineux (50 maximum)."),
  clientTime: DateTimeOffsetSchema.optional(),
});
export type SyncPushRequest = z.infer<typeof SyncPushSchema>;

/** Statut d'un accusé par événement (§8.2 : accepté | doublon | rejeté + motif). */
export const PushAckStatusSchema = z.enum(["accepted", "duplicate", "rejected"]);
export type PushAckStatus = z.infer<typeof PushAckStatusSchema>;

/** Accusé renvoyé pour CHAQUE événement — plus jamais d'échec HTTP de tout le lot. */
export const PushAckSchema = z.object({
  id: z.string(),
  status: PushAckStatusSchema,
  collectionId: z.string().optional(),
  /** Renseigné uniquement pour status = "rejected". */
  reason: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});
export type PushAck = z.infer<typeof PushAckSchema>;

/** Réponse de `POST /v1/sync/push`. */
export const SyncPushResponseSchema = z.object({
  acks: z.array(PushAckSchema),
  serverTime: z.string(),
  device: z.object({
    id: z.string(),
    clockSkewMs: z.number().int().nullable(),
  }),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

/**
 * Réponse de `GET /v1/sync/pull?cursor=` (§8.3) : snapshot complet au premier
 * appel (mode "full"), puis delta incrémental (mode "delta"). Les objets
 * métier reprennent les formes du web (`/api/agent/tour`, `/api/agent/clients`)
 * — d'où le `passthrough()` : les champs riches (livret sérialisé, fenêtre
 * encaissable) sont décrits par PARITE.md §3.2, pas restreints ici.
 */
export const SyncPullResponseSchema = z
  .object({
    mode: z.enum(["full", "delta"]),
    /** Curseur à rejouer à l'appel suivant (horodatage serveur). */
    cursor: z.string(),
    serverTime: z.string(),
    device: z
      .object({
        id: z.string(),
        label: z.string(),
        revokedAt: z.string().nullable(),
        clockSkewMs: z.number().int().nullable(),
      })
      .passthrough(),
    structure: z.object({ name: z.string(), lateThreshold: z.number().int() }).passthrough(),
    agent: z.object({ name: z.string(), phone: z.string() }).passthrough(),
    contributors: z
      .array(z.object({ id: z.string(), fullName: z.string(), neighborhood: z.string().nullable() }).passthrough()),
    passbooks: z.array(z.object({ passbookId: z.string(), dailyAmount: z.number().int() }).passthrough()),
    collections: z
      .array(z.object({ id: z.string(), passbookId: z.string(), amount: z.number().int() }).passthrough()),
    closing: z.object({ status: z.string() }).passthrough().nullable(),
  })
  .passthrough();
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;
