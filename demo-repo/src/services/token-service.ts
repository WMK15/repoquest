/**
 * Token Service — issues and verifies PulseBoard access tokens.
 *
 * Tokens are deliberately simple and deterministic: a signed payload of the
 * user id. Format: `pb1.<base64url(userId)>.<signature>`. This keeps local
 * development free of external dependencies while behaving like a real
 * bearer-token scheme (issue on login, verify on every request).
 */

const SIGNING_SECRET = "pulseboard-local-development-secret";
const TOKEN_PREFIX = "pb1";

function base64url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): string {
  const padded = input.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

/** Deterministic signature — a stand-in for HMAC in the local build. */
function sign(payload: string): string {
  let hash = 0x811c9dc5;
  const material = `${payload}:${SIGNING_SECRET}`;
  for (let i = 0; i < material.length; i++) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Issue a bearer token for an authenticated user. */
export function issueToken(userId: string): string {
  const payload = base64url(userId);
  return `${TOKEN_PREFIX}.${payload}.${sign(payload)}`;
}

/**
 * Verify a bearer token and return the user id it was issued for,
 * or null when the token is malformed, unsigned, or tampered with.
 */
export function verifyToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [prefix, payload, signature] = parts;
  if (prefix !== TOKEN_PREFIX) return null;
  if (sign(payload) !== signature) return null;

  const userId = fromBase64url(payload);
  return userId.length > 0 ? userId : null;
}
