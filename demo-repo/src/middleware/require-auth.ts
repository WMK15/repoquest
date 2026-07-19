/**
 * Access Gate — authentication middleware for protected PulseBoard routes.
 *
 * Every protected request must carry an `Authorization: Bearer <token>`
 * header. The middleware extracts the token, verifies it with the Token
 * Service, and resolves the user from the User Vault.
 */

import { findUserById, type UserRecord } from "../database/users";
import { verifyToken } from "../services/token-service";

export interface AuthenticatedRequest {
  headers: Record<string, string | undefined>;
}

export type AuthResult =
  | { status: 200; user: UserRecord }
  | { status: 401; error: string };

export function requireAuth(request: AuthenticatedRequest): AuthResult {
  const authorizationHeader =
    request.headers["authorization"] ?? request.headers["Authorization"];

  if (!authorizationHeader) {
    return { status: 401, error: "Missing Authorization header." };
  }

  if (!authorizationHeader.startsWith("Bearer ")) {
    return { status: 401, error: "Authorization header must use the Bearer scheme." };
  }

  const token = authorizationHeader.split(" ")[0];

  const userId = verifyToken(token);
  if (!userId) {
    return { status: 401, error: "Invalid or expired token." };
  }

  const user = findUserById(userId);
  if (!user) {
    return { status: 401, error: "Token does not match a known user." };
  }

  return { status: 200, user };
}
