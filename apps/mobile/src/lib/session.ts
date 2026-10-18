// TontiHelm mobile — session : jetons /v1 dans le coffre sécurisé, rotation
// automatique (401 → refresh → nouvel essai), enregistrement d'appareil par
// OTP, purge locale à la déconnexion et à la révocation (PARITE.md §8.5/§8.7).
// Le PIN n'est JAMAIS conservé : il traverse une requête et disparaît.
// La purge efface AUSSI le miroir chiffré de la tournée et la file d'envoi :
// les données d'un appareil déconnecté ne restent pas sur le téléphone.
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { apiGet, apiPost, ApiClientError } from "./api";
import { wipeLocalData } from "@/local/db";
import type { MobileUser, TokenPair } from "@tontihelm/schemas";

const KEYS = {
  tokens: "th.mobile.tokens",
  device: "th.mobile.device",
  user: "th.mobile.user",
} as const;

export interface StoredDevice {
  id: string;
  label: string;
}

export interface PendingChallenge {
  challengeId: string;
  requiresDeviceLabel: boolean;
  /** Hors production uniquement : le backend dev renvoie le code (mode dev). */
  devCode?: string;
  deviceLabel: string;
  /** Appareil déjà connu (2FA dirigeant/gérant) — sinon enregistrement. */
  deviceId?: string;
}

type SessionStatus = "boot" | "anonymous" | "otp_pending" | "authenticated";

interface SessionState {
  status: SessionStatus;
  user: MobileUser | null;
  device: StoredDevice | null;
  tokens: TokenPair | null;
  pending: PendingChallenge | null;
  bootstrap: () => Promise<void>;
  login: (phone: string, pin: string, deviceLabel: string) => Promise<"otp" | "home">;
  verifyOtp: (code: string, deviceLabel: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Requête authentifiée : attache le jeton, pivote sur 401 puis réessaie. */
  authedGet: (path: string) => Promise<Record<string, unknown>>;
  authedPost: (path: string, body: Record<string, unknown> | unknown[]) => Promise<Record<string, unknown>>;
  purge: (options?: { remote?: boolean }) => Promise<void>;
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await SecureStore.setItemAsync(key, JSON.stringify(value));
}

async function clearAll(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.tokens).catch(() => undefined),
    SecureStore.deleteItemAsync(KEYS.device).catch(() => undefined),
    SecureStore.deleteItemAsync(KEYS.user).catch(() => undefined),
    // Miroir + file d'envoi locaux : l'état d'un appareil déconnecté (ou
    // révoqué) ne survit pas sur le téléphone (no-op si base jamais ouverte).
    wipeLocalData().catch(() => undefined),
  ]);
}

export const useSession = create<SessionState>((set, get) => ({
  status: "boot",
  user: null,
  device: null,
  tokens: null,
  pending: null,

  async bootstrap() {
    const [tokens, device, user] = await Promise.all([
      readJson<TokenPair>(KEYS.tokens),
      readJson<StoredDevice>(KEYS.device),
      readJson<MobileUser>(KEYS.user),
    ]);
    if (tokens && device && user) {
      set({ status: "authenticated", tokens, device, user });
    } else {
      await clearAll();
      set({ status: "anonymous", tokens: null, device: null, user: null });
    }
  },

  async login(phone, pin, deviceLabel) {
    const body = await apiPost("/v1/auth/login", {
      phone,
      pin,
      deviceLabel: deviceLabel || undefined,
      deviceId: get().device?.id,
    });
    if (body.status === "otp_required") {
      set({
        status: "otp_pending",
        pending: {
          challengeId: body.challengeId as string,
          requiresDeviceLabel: body.requiresDeviceLabel === true,
          devCode: body.devCode as string | undefined,
          deviceLabel,
          deviceId: undefined,
        },
      });
      return "otp";
    }
    // Appareil connu sans second facteur : jetons directs.
    const tokens = body.tokens as unknown as TokenPair;
    const user = body.user as MobileUser;
    const device = body.device as StoredDevice;
    await Promise.all([writeJson(KEYS.tokens, tokens), writeJson(KEYS.device, device), writeJson(KEYS.user, user)]);
    set({ status: "authenticated", tokens, user, device, pending: null });
    return "home";
  },

  async verifyOtp(code, deviceLabel) {
    const pending = get().pending;
    if (!pending) throw new ApiClientError("no_challenge", "Aucun code demandé. Reconnecte-toi.", 400);
    const body = await apiPost("/v1/auth/otp/verify", {
      challengeId: pending.challengeId,
      code,
      deviceLabel: deviceLabel || pending.deviceLabel || undefined,
    });
    const tokens = body.tokens as unknown as TokenPair;
    const user = body.user as MobileUser;
    const device = body.device as StoredDevice;
    await Promise.all([writeJson(KEYS.tokens, tokens), writeJson(KEYS.device, device), writeJson(KEYS.user, user)]);
    set({ status: "authenticated", tokens, user, device, pending: null });
  },

  async logout() {
    const { tokens } = get();
    if (tokens?.refreshToken) {
      await apiPost("/v1/auth/logout", { refreshToken: tokens.refreshToken }).catch(() => undefined);
    }
    await clearAll();
    set({ status: "anonymous", tokens: null, device: null, user: null, pending: null });
  },

  async authedGet(path) {
    const tokens = get().tokens;
    if (!tokens) throw new ApiClientError("unauthorized", "Session expirée. Reconnecte-toi.", 401);
    try {
      return await apiGet(path, tokens.accessToken);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        const refreshed = await refreshTokens();
        return apiGet(path, refreshed.accessToken);
      }
      throw err;
    }
  },

  async authedPost(path, body) {
    const tokens = get().tokens;
    if (!tokens) throw new ApiClientError("unauthorized", "Session expirée. Reconnecte-toi.", 401);
    try {
      return await apiPost(path, body, tokens.accessToken);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        const refreshed = await refreshTokens();
        return apiPost(path, body, refreshed.accessToken);
      }
      throw err;
    }
  },

  async purge(options) {
    if (options?.remote !== false) await clearAll();
    set({ status: "anonymous", tokens: null, device: null, user: null, pending: null });
  },
}));

/** Rotation du jeton de renouvellement + persistance + mise à jour du store. */
async function refreshTokens(): Promise<TokenPair> {
  const { tokens } = useSession.getState();
  if (!tokens?.refreshToken) {
    await useSession.getState().purge();
    throw new ApiClientError("unauthorized", "Session expirée. Reconnecte-toi.", 401);
  }
  try {
    const body = await apiPost("/v1/auth/refresh", { refreshToken: tokens.refreshToken });
    const fresh = body.tokens as unknown as TokenPair;
    await writeJson(KEYS.tokens, fresh);
    useSession.setState({ tokens: fresh });
    return fresh;
  } catch (err) {
    // device_revoked / invalid_refresh : purge locale (PARITE.md §8.5 —
    // l'état de l'appareil revenu par l'authentification commande l'effacement).
    await useSession.getState().purge({ remote: false });
    throw err;
  }
}
