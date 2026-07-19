/**
 * Authentication Route — the login endpoint for PulseBoard.
 *
 * Accepts employee credentials, checks them against the User Vault,
 * and asks the Token Service to issue a bearer token.
 */

import { verifyCredentials } from "../database/users";
import { issueToken } from "../services/token-service";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  status: number;
  body:
    | { token: string; userId: string; name: string }
    | { error: string };
}

export function handleLogin(request: LoginRequest): LoginResponse {
  if (!request.email || !request.password) {
    return {
      status: 400,
      body: { error: "Email and password are required." },
    };
  }

  const user = verifyCredentials(request.email, request.password);
  if (!user) {
    return {
      status: 401,
      body: { error: "Invalid credentials." },
    };
  }

  return {
    status: 200,
    body: {
      token: issueToken(user.id),
      userId: user.id,
      name: user.name,
    },
  };
}
