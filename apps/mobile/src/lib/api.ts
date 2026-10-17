// TontiHelm mobile — client HTTP du canal /v1 (socle phase 1).
// Enveloppe d'erreur unique du backend : { error: { code, message } } — les
// messages sont déjà en français, on les remonte tels quels à l'interface.
// L'URL de base vient de EXPO_PUBLIC_API_BASE (défaut : serveur de développement).

export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE ??
  process.env.EXPO_PUBLIC_API_URL ??
  "http://localhost:3001";

export class ApiClientError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function parse(res: Response): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // corps vide ou non JSON (passerelle injoignable)
  }
  if (!res.ok) {
    const err = body.error as { code?: string; message?: string } | undefined;
    throw new ApiClientError(
      err?.code ?? "network_error",
      err?.message ?? "Impossible de joindre TontiHelm. Vérifie ta connexion et réessaie.",
      res.status
    );
  }
  return body;
}

export async function apiGet(path: string, token?: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return parse(res);
}

export async function apiPost(
  path: string,
  body: Record<string, unknown> | unknown[],
  token?: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return parse(res);
}

export async function apiDelete(path: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return parse(res);
}
