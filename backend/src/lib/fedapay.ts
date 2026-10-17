// TontiHelm — service FedaPay (paiement d'inscription, patron Academia Helm).
// Appels REST directs à l'API v1 de FedaPay (pas de SDK) :
//   · POST /v1/transactions          — crée la transaction (clé secrète) ;
//   · GET  /v1/transactions/:id      — relit le statut RÉEL (vérification) ;
//   · POST /v1/transactions/:id/token — page de paiement hébergée (secours).
// Environnements : https://api.fedapay.com (live) / https://sandbox-api.fedapay.com (test).
// Le statut renvoyé par le navigateur n'est JAMAIS cru : c'est toujours cette
// lecture serveur qui décide de l'activation d'un compte.
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

function apiBaseUrl(): string {
  const mode = (process.env.FEDAPAY_MODE ?? "").toLowerCase();
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
    base = mode === "live" ? "https://api.fedapay.com" : "https://sandbox-api.fedapay.com";
  }
  return base;
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
    throw new Error(
      `FedaPay a refusé la requête (${res.status}) : ${data?.message ?? "erreur inconnue"}${fields ? ` [${fields}]` : ""}`,
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
 * Crée une transaction FedaPay.
 * client (countryName) d'après le patron Academia Helm. Le montant est TOUJOURS
 * un entier (le FCFA n'a pas de centimes).
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
  const created = await fedapayRequest<{ id: string | number; reference?: string; url?: string; payment_url?: string }>(
    "/v1/transactions",
    { method: "POST", body: JSON.stringify(payload) },
  );
  return {
    transactionId: String(created.id),
    reference: created.reference ?? String(created.id),
    paymentUrl: created.payment_url ?? created.url ?? null,
    status: "pending",
  };
}

/** Relit le statut réel d'une transaction auprès de FedaPay. */
export async function fedapayGetTransaction(transactionId: string): Promise<FedaPayVerification> {
  const tx = await fedapayRequest<{
    id: string | number;
    status?: string;
    reference?: string;
    amount?: number;
  }>(`/v1/transactions/${transactionId}`);
  return {
    status: (tx.status ?? "pending").toLowerCase(),
    reference: tx.reference ?? null,
    amount: typeof tx.amount === "number" ? tx.amount : null,
  };
}
