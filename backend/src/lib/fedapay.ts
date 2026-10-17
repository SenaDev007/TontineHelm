// TontiHelm — service FedaPay (paiement d'inscription, patron Academia Helm).
// Appels REST directs à l'API v1 de FedaPay (pas de SDK) :
//   · POST /v1/transactions           — crée la transaction (clé secrète) ;
//   · POST /v1/transactions/:id/token — jeton + lien de la page de paiement hébergée ;
//   · GET  /v1/transactions/:id       — relit le statut RÉEL (vérification).
// Environnements : https://api.fedapay.com (live) / https://sandbox-api.fedapay.com (test).
// Le statut renvoyé par le navigateur n'est JAMAIS cru : c'est toujours cette
// lecture serveur qui décide de l'activation d'un compte.
//
// ⚠ LEÇON ACADEMIA HELM (bug historique 28-29/09/2026, reproduite ici le
//   17/10/2026) : l'API v1 renvoie la transaction ENVELOPPÉE sous la clé
//   « v1/transaction » (et parfois « transaction », « data », ou une liste
//   « v1/transactions »). Lire `response.id` au premier niveau donne
//   `undefined` → le widget FedaPay affiche « Modèle V1::Transaction non
//   trouvé » et la vérification boucle sur /transactions/undefined. On
//   dépaquette donc TOUTES les formes connues, comme le fait Academia Helm.
export interface FedaPayCustomer {
  email?: string;
  firstname?: string;
  lastname?: string;
  phone_number?: string;
}

export interface FedaPayTransactionResult {
  transactionId: string;
  reference: string;
  paymentUrl: string | null;
  status: string;
}

export interface FedaPayVerification {
  status: "approved" | "declined" | "pending" | "transferred" | string;
  reference: string | null;
  amount: number | null;
}

export function fedapayConfigured(): boolean {
  return Boolean(process.env.FEDAPAY_SECRET_KEY && process.env.FEDAPAY_PUBLIC_KEY);
}

/**
 * Mode test (paiement simulé, aucun argent réel) :
 *   · hors production (préproduction sandbox) : actif par défaut ;
 *   · en production : UNIQUEMENT si FEDAPAY_TEST_MODE=true est posé explicitement.
 * En production sans clés NI mode test, la souscription refuse de démarrer avec
 * un message clair — jamais de compte gratuit par accident.
 */
export function fedapayTestMode(): boolean {
  if (process.env.FEDAPAY_TEST_MODE === "true") return true;
  if (process.env.NODE_ENV === "production") return false;
  return true;
}

/**
 * Environnement FedaPay dérivé des PRÉFIXES des clés (source de vérité de la
 * dashboard FedaPay), comme Academia Helm : pk_live/sk_live → live,
 * pk_sandbox/sk_test → sandbox. Le widget checkout.js choisit lui-même son
 * domaine d'après le préfixe de la clé PUBLIQUE — le backend doit donc créer
 * la transaction dans le MÊME environnement, sinon « Transaction non trouvé ».
 */
export function fedapayEnvironment(): "live" | "sandbox" {
  const secret = process.env.FEDAPAY_SECRET_KEY ?? "";
  if (secret.startsWith("sk_live")) return "live";
  if (secret.startsWith("sk_sandbox") || secret.startsWith("sk_test")) return "sandbox";
  const mode = (process.env.FEDAPAY_MODE ?? "").toLowerCase();
  return mode === "live" ? "live" : "sandbox";
}

/**
 * Cohérence clé publique ↔ clé secrète : un préfixe pk_live avec sk_sandbox
 * (ou l'inverse) garantit un « Transaction non trouvé » côté widget. On
 * l'expose pour refuser proprement le démarrage du paiement au lieu de
 * laisser l'utilisateur payer dans le vide.
 */
export function fedapayKeysCoherent(): boolean {
  const pub = process.env.FEDAPAY_PUBLIC_KEY ?? "";
  const livePub = pub.startsWith("pk_live");
  const sandboxPub = pub.startsWith("pk_sandbox") || pub.startsWith("pk_test");
  if (!livePub && !sandboxPub) return true; // préfixe inconnu : on ne bloque pas
  return livePub ? fedapayEnvironment() === "live" : fedapayEnvironment() === "sandbox";
}

function apiBaseUrl(): string {
  const env = fedapayEnvironment(); // dérivé des clés d'abord
  const raw = process.env.FEDAPAY_API_URL?.trim();
  let base: string;
  if (raw) {
    base = raw
      .replace(/\/+$/, "")
      .replace("live.fedapay.com", "api.fedapay.com")
      .replace("sandbox.fedapay.com/api", "sandbox-api.fedapay.com")
      .replace("sandbox.fedapay.com", "sandbox-api.fedapay.com")
      .replace(/\/v1$/, "");
  } else {
    base = env === "live" ? "https://api.fedapay.com" : "https://sandbox-api.fedapay.com";
  }
  return base;
}

/**
 * Dépaquette l'enveloppe v1 de FedaPay (leçon Academia Helm) :
 *   { "v1/transaction": {...} }   — format RÉEL du retrieve/crate v1
 *   { transaction: {...} }        — format standard
 *   { data: {...} }               — format SDK
 *   { v1/transactions: [...] }    — format liste
 *   { id, reference, ... }        — format direct
 */
function unwrapV1<T>(body: unknown): T | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const candidate =
    b["v1/transaction"] ??
    b.transaction ??
    b.data ??
    (Array.isArray(b["v1/transactions"]) ? b["v1/transactions"][0] : undefined) ??
    body;
  return (candidate && typeof candidate === "object" ? candidate : null) as T | null;
}

/** Erreur FedaPay avec le code HTTP conservé (404 = définitif, 5xx = retryable). */
export class FedaPayApiError extends Error {
  readonly httpStatus: number;
  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = "FedaPayApiError";
    this.httpStatus = httpStatus;
  }
}

async function fedapayRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.FEDAPAY_SECRET_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* corps vide */
  }
  if (!res.ok) {
    const data = body as { message?: string; errors?: Record<string, string[]> } | null;
    const fields = data?.errors
      ? Object.entries(data.errors)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
          .join(" ; ")
      : "";
    throw new FedaPayApiError(
      `FedaPay a refusé la requête (${res.status}) : ${data?.message ?? "erreur inconnue"}${fields ? ` [${fields}]` : ""}`,
      res.status,
    );
  }
  return body as T;
}

/** Normalise un téléphone béninois au format attendu par FedaPay. */
function beninPhoneObject(phone: string): { number: string; country: string } {
  const digits = phone.replace(/[^\d+]/g, "");
  const local = digits.startsWith("+229")
    ? digits.slice(4)
    : digits.startsWith("229")
      ? digits.slice(3)
      : digits;
  return { number: local.replace(/^0+/, ""), country: "BJ" };
}

/**
 * Crée une transaction FedaPay puis génère le LIEN DE PAIEMENT HÉBERGÉ
 * (patron Academia Helm : la page pleine page de FedaPay, obtenue via
 * POST /v1/transactions/:id/token → { token, url }).
 * Le montant est TOUJOURS un entier (le FCFA n'a pas de centimes).
 */
export async function fedapayCreateTransaction(input: {
  amount: number;
  description: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
  customer?: FedaPayCustomer;
}): Promise<FedaPayTransactionResult> {
  const payload: Record<string, unknown> = {
    description: input.description,
    amount: Math.max(1, Math.round(input.amount)),
    currency: { iso: "XOF" },
    callback_url: input.callbackUrl,
    metadata: input.metadata,
    custom_metadata: input.metadata, // renvoyé tel quel par les webhooks FedaPay
  };
  // Client : FedaPay exige un email valide si présent — on ne l'envoie que
  // s'il est renseigné ; l'utilisateur complète ses coordonnées (numéro Mobile
  // Money notamment) directement sur la page de paiement.
  if (input.customer?.email) {
    payload.customer = {
      email: String(input.customer.email).trim(),
      ...(input.customer.firstname && { firstname: String(input.customer.firstname).trim() }),
      ...(input.customer.lastname && { lastname: String(input.customer.lastname).trim() }),
      ...(input.customer.phone_number && {
        phone_number: beninPhoneObject(input.customer.phone_number),
      }),
    };
  }
  const raw = await fedapayRequest<Record<string, unknown>>("/v1/transactions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const created = unwrapV1<{
    id?: string | number;
    reference?: string;
    status?: string;
    token?: string;
    url?: string;
    payment_url?: string;
  }>(raw);
  // Garde anti-« undefined » : mieux vaut échouer clairement que d'envoyer au
  // widget un identifiant fantôme (« Transaction non trouvée » + boucle).
  const id =
    created?.id !== undefined && created?.id !== null && String(created?.id).trim() !== ""
      ? String(created.id)
      : null;
  if (!id) {
    const preview = JSON.stringify(raw).slice(0, 300);
    throw new FedaPayApiError(
      `FedaPay n'a pas renvoyé d'identifiant de transaction (réponse inattendue : ${preview}).`,
      502,
    );
  }
  const inlineUrl: string | null = created?.payment_url ?? created?.url ?? null;
  return {
    transactionId: id,
    reference: created?.reference ?? id,
    paymentUrl: inlineUrl ?? (await fedapayPaymentPageUrl(id)),
    status: created?.status ?? "pending",
  };
}

/**
 * Lien de la page de paiement hébergée FedaPay (pleine page, patron Academia
 * Helm) : POST /v1/transactions/:id/token → { token, url }. Régénérable à
 * volonté pour une même transaction (retour arrière, double-clic).
 */
export async function fedapayPaymentPageUrl(transactionId: string): Promise<string | null> {
  try {
    const raw = await fedapayRequest<Record<string, unknown>>(
      `/v1/transactions/${encodeURIComponent(transactionId)}/token`,
      { method: "POST" },
    );
    const url =
      (typeof raw?.url === "string" && raw.url) ||
      (typeof raw?.token === "string" && raw.token ? null : null);
    if (url) return url;
    // Certaines réponses ne portent que le jeton : on reconstruit le lien.
    if (typeof raw?.token === "string" && raw.token) {
      const env = fedapayEnvironment();
      return `https://${env === "live" ? "" : "sandbox."}fedapay.com/r/${raw.token}`;
    }
    return null;
  } catch {
    // Le lien hébergé est un confort, pas une nécessité : sans lui, le front
    // bascule sur le widget intégré (amount + description, comme Academia Helm).
    return null;
  }
}

/** Relit le statut réel d'une transaction auprès de FedaPay. */
export async function fedapayGetTransaction(transactionId: string): Promise<FedaPayVerification> {
  const raw = await fedapayRequest<Record<string, unknown>>(
    `/v1/transactions/${encodeURIComponent(transactionId)}`,
  );
  const tx = unwrapV1<{
    id?: string | number;
    status?: string;
    reference?: string;
    amount?: number;
  }>(raw);
  if (!tx || (tx.id === undefined && tx.reference === undefined)) {
    const preview = JSON.stringify(raw).slice(0, 300);
    throw new FedaPayApiError(
      `Réponse FedaPay illisible lors de la vérification ( ${preview}).`,
      502,
    );
  }
  return {
    status: (tx.status ?? "pending").toLowerCase(),
    reference: tx.reference ?? null,
    amount: typeof tx.amount === "number" ? tx.amount : null,
  };
}
