/**
 * Login Interface — the client-side entry point to PulseBoard.
 *
 * Sends credentials to the authentication route, stores the bearer token,
 * and attaches it to every subsequent request.
 */

import { handleLogin } from "../routes/auth";
import type { AuthenticatedRequest } from "../middleware/require-auth";

let storedToken: string | null = null;

export interface LoginResult {
  ok: boolean;
  token?: string;
  error?: string;
}

/** Log in and keep the bearer token for later requests. */
export function login(email: string, password: string): LoginResult {
  const response = handleLogin({ email, password });

  if (response.status !== 200 || !("token" in response.body)) {
    const error =
      "error" in response.body ? response.body.error : "Login failed.";
    return { ok: false, error };
  }

  storedToken = response.body.token;
  return { ok: true, token: storedToken };
}

export function getStoredToken(): string | null {
  return storedToken;
}

export function clearSession(): void {
  storedToken = null;
}

/** Build a request that carries the stored token as a Bearer credential. */
export function buildAuthorizedRequest(): AuthenticatedRequest {
  if (!storedToken) {
    throw new Error("No session token. Call login() first.");
  }
  return {
    headers: {
      authorization: `Bearer ${storedToken}`,
    },
  };
}
