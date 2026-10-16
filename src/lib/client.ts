"use client";
// TontiHelm — client API côté navigateur : erreurs au format unique (code + message français).
// Deux modes d'adressage :
//   · production : NEXT_PUBLIC_API_URL pointe vers l'API Railway (domains Vercel ↔ Railway distincts) ;
//   · préproduction sandbox : requêtes relatives via la passerelle, port du backend
//     transmis par le paramètre XTransformPort.
// Authentification : jeton de session en en-tête Authorization Bearer (fonctionne sur
// tous les domaines), cookie httpOnly conservé en renfort.

const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? "3001";
const TOKEN_KEY = "tontihelm_token";

export class ApiClientError extends Error {
  code: string;
  constructor(message: string, code = "error") {
    super(message);
    this.code = code;
  }
}

/** Construit l'URL complète d'un appel API selon l'environnement. */
export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (base) return `${base.replace(/\/$/, "")}${path}`;
  return `${path}${path.includes("?") ? "&" : "?"}XTransformPort=${API_PORT}`;
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* corps vide */
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiClientError(err?.message ?? "Une erreur est survenue. Réessaie.", err?.code ?? "error");
  }
  return data as T;
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const get = <T>(path: string) => api<T>(path);
