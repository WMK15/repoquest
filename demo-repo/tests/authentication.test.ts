import { beforeEach, describe, expect, it } from "vitest";

import { clearSession, buildAuthorizedRequest, login } from "../src/client/login";
import { requireAuth } from "../src/middleware/require-auth";
import { issueToken, verifyToken } from "../src/services/token-service";

const EMPLOYEE = {
  email: "amara.osei@pulse.internal",
  password: "correct-horse-battery",
};

describe("PulseBoard authentication flow", () => {
  beforeEach(() => {
    clearSession();
  });

  it("issues a verifiable token for a known user", () => {
    const token = issueToken("usr_01");
    expect(token).toMatch(/^pb1\./);
    expect(verifyToken(token)).toBe("usr_01");
  });

  it("logs an employee in and returns a bearer token", () => {
    const result = login(EMPLOYEE.email, EMPLOYEE.password);
    expect(result.ok).toBe(true);
    expect(result.token).toBeDefined();
  });

  it("authorises a request that carries a valid bearer token", () => {
    const session = login(EMPLOYEE.email, EMPLOYEE.password);
    expect(session.ok).toBe(true);

    const request = buildAuthorizedRequest();
    expect(request.headers.authorization).toBe(`Bearer ${session.token}`);

    const result = requireAuth(request);

    // A valid employee token must open the Access Gate.
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.user.email).toBe(EMPLOYEE.email);
    }
  });
});
