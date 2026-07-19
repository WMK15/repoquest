import type { InvestigationEvent, InvestigationResult, RepositoryCampaign } from "./types";

/**
 * The verified fallback campaign for PulseBoard. The entire demo works
 * from this object alone; AI enhances it but never gates it.
 */
export function buildDeterministicCampaign(): RepositoryCampaign {
  return {
    repositoryName: "PulseBoard",
    summary:
      "PulseBoard is an internal task-management application. Employees authenticate with company credentials, receive a bearer token, and every protected request passes through an authentication middleware before reaching data.",
    nodes: [
      {
        id: "login-interface",
        label: "Login Interface",
        gameLabel: "Entry Terminal",
        description:
          "The client entry point. Sends credentials to the authentication route and stores the returned bearer token for later requests.",
        status: "healthy",
        sourceFiles: ["src/client/login.ts"],
        position: { x: 60, y: 40 },
        documentation: [
          {
            path: "README.md",
            heading: "Authentication in one paragraph",
            insight: "The login interface is the only client-side module.",
          },
        ],
      },
      {
        id: "authentication-route",
        label: "Authentication Route",
        gameLabel: "Identity Relay",
        description:
          "The login endpoint. Verifies credentials against the User Vault and asks the Token Service to issue a bearer token.",
        status: "healthy",
        sourceFiles: ["src/routes/auth.ts"],
        position: { x: 340, y: 130 },
        documentation: [
          {
            path: "docs/ARCHITECTURE.md",
            heading: "Authentication Route",
            insight: "Never issues tokens for unverified users.",
          },
        ],
      },
      {
        id: "token-service",
        label: "Token Service",
        gameLabel: "Token Forge",
        description:
          "Issues and verifies signed bearer tokens in the format pb1.<payload>.<signature>. The single authority on token format.",
        status: "healthy",
        sourceFiles: ["src/services/token-service.ts"],
        position: { x: 620, y: 40 },
        documentation: [
          {
            path: "docs/authentication.md",
            heading: "Token format",
            insight:
              "verifyToken returns the user id for a valid token and null otherwise.",
          },
        ],
      },
      {
        id: "access-gate",
        label: "Access Gate",
        gameLabel: "Access Gate",
        description:
          "Authentication middleware guarding every protected route. Extracts the bearer token from the Authorization header and verifies it.",
        status: "corrupted",
        sourceFiles: ["src/middleware/require-auth.ts"],
        position: { x: 620, y: 300 },
        documentation: [
          {
            path: "docs/authentication.md",
            heading: "Header contract",
            insight:
              "The token is the part after the space — not the scheme word.",
          },
          {
            path: "AGENTS.md",
            insight:
              "If authenticated requests fail, start at the Access Gate and the Token Service.",
          },
        ],
      },
      {
        id: "user-vault",
        label: "User Vault",
        gameLabel: "User Vault",
        description:
          "The employee directory. Resolves user ids to records and verifies login credentials. Deterministic in local development.",
        status: "healthy",
        sourceFiles: ["src/database/users.ts"],
        position: { x: 340, y: 400 },
        documentation: [
          {
            path: "docs/ARCHITECTURE.md",
            heading: "User Vault",
            insight: "Seeded at boot; fed by the HR sync in production.",
          },
        ],
      },
    ],
    edges: [
      {
        id: "e-login-auth",
        source: "login-interface",
        target: "authentication-route",
        description: "Sends employee credentials",
      },
      {
        id: "e-auth-token",
        source: "authentication-route",
        target: "token-service",
        description: "Requests a bearer token",
      },
      {
        id: "e-auth-vault",
        source: "authentication-route",
        target: "user-vault",
        description: "Verifies credentials",
      },
      {
        id: "e-token-gate",
        source: "token-service",
        target: "access-gate",
        description: "Token verified on every request",
      },
      {
        id: "e-gate-vault",
        source: "access-gate",
        target: "user-vault",
        description: "Resolves the authenticated user",
      },
    ],
    knowledgeArchive: [
      {
        path: "README.md",
        title: "PulseBoard",
        kind: "overview",
        summary:
          "Project overview: what PulseBoard is, where each component lives, and how authentication works end to end.",
        headings: ["What lives here", "Authentication in one paragraph", "Running the tests"],
        relatedNodeIds: [
          "login-interface",
          "authentication-route",
          "token-service",
          "access-gate",
          "user-vault",
        ],
      },
      {
        path: "docs/ARCHITECTURE.md",
        title: "PulseBoard Architecture",
        kind: "architecture",
        summary:
          "System boundaries and the five-component request flow, plus the design rules each component must follow.",
        headings: ["Request flow", "Components", "Design rules"],
        relatedNodeIds: [
          "login-interface",
          "authentication-route",
          "token-service",
          "access-gate",
          "user-vault",
        ],
      },
      {
        path: "docs/authentication.md",
        title: "Authentication",
        kind: "other",
        summary:
          "The token format, the Authorization header contract, and the exact responsibilities of the Access Gate.",
        headings: ["Token format", "Header contract", "Common pitfalls", "Testing"],
        relatedNodeIds: ["token-service", "access-gate"],
      },
      {
        path: "CONTRIBUTING.md",
        title: "Contributing to PulseBoard",
        kind: "contribution",
        summary:
          "Engineering conventions: strict TypeScript, smallest safe change, and the reproduce-trace-fix-test workflow.",
        headings: ["Conventions", "Workflow", "Testing"],
        relatedNodeIds: [],
      },
      {
        path: "AGENTS.md",
        title: "Agent instructions for PulseBoard",
        kind: "agent-instructions",
        summary:
          "Ground rules for automated agents: the test command, key authentication facts, and where to start when requests fail.",
        headings: ["Ground rules", "Commands", "Key facts"],
        relatedNodeIds: ["access-gate", "token-service"],
      },
    ],
    contradictions: [
      {
        documentedClaim:
          "docs/authentication.md: the Access Gate extracts the part after the space — not the scheme word.",
        codeEvidence:
          'require-auth.ts passes split(" ")[0] — the literal string "Bearer" — into verifyToken.',
        documentationPath: "docs/authentication.md",
        sourcePath: "src/middleware/require-auth.ts",
      },
    ],
    mission: {
      id: "mission-01",
      title: "The Broken Gate",
      narrative:
        "A valid employee token reaches the server, but the Access Gate refuses to open. Every authenticated request returns 401 Unauthorized.",
      objective:
        "Trace the authentication request and identify where access is being denied.",
      suspectNodeIds: ["login-interface", "token-service", "access-gate"],
      corruptedNodeId: "access-gate",
    },
  };
}

/** Grounded, timed investigation activity for the deterministic path. */
export function buildDeterministicInvestigation(): InvestigationResult {
  const events: InvestigationEvent[] = [
    { type: "phase_started", phase: "scout", label: "Scout mapping the territory" },
    {
      type: "documentation_read",
      path: "README.md",
      nodeId: "login-interface",
      message: "Scout opened README.md — authentication flow identified",
    },
    {
      type: "documentation_read",
      path: "docs/ARCHITECTURE.md",
      message: "Scout traced the request path: Entry Terminal → Identity Relay → Token Forge → Access Gate",
    },
    {
      type: "documentation_read",
      path: "AGENTS.md",
      nodeId: "access-gate",
      message: "Scout found the test command and a pointer: start at the Access Gate",
    },
    { type: "phase_started", phase: "investigator", label: "Investigator tracing the request" },
    {
      type: "test_run",
      command: "npm test",
      success: false,
      message: "Investigator ran authentication.test.ts — expected 200, received 401",
    },
    {
      type: "file_read",
      path: "src/client/login.ts",
      nodeId: "login-interface",
      message: "Investigator inspected login.ts — token stored and sent as Bearer <token>",
    },
    {
      type: "file_read",
      path: "src/services/token-service.ts",
      nodeId: "token-service",
      message: "Investigator verified token-service.ts — issued tokens verify correctly in isolation",
    },
    {
      type: "finding",
      nodeId: "login-interface",
      message: "Entry Terminal ruled out — the header it sends is well-formed",
    },
    {
      type: "finding",
      nodeId: "token-service",
      message: "Token Forge ruled out — issueToken and verifyToken round-trip cleanly",
    },
    {
      type: "file_read",
      path: "src/middleware/require-auth.ts",
      nodeId: "access-gate",
      message: "Investigator inspected require-auth.ts — the header is split, then index [0] is taken",
    },
    {
      type: "finding",
      nodeId: "access-gate",
      message:
        'Access Gate suspect confirmed: split(" ")[0] yields the scheme word "Bearer", not the token',
    },
    {
      type: "investigation_complete",
      rootCause:
        'The middleware passes the authentication scheme, "Bearer", into token verification instead of the token itself.',
      proposedFix:
        "Change the array index in require-auth.ts from [0] to [1] so the token — the part after the space — is verified.",
    },
  ];

  return {
    events,
    rootCause:
      'The middleware passes the authentication scheme, "Bearer", into token verification instead of the token itself.',
    proposedFix:
      "Change the array index in require-auth.ts from [0] to [1] so the token — the part after the space — is verified.",
    diff: {
      file: "src/middleware/require-auth.ts",
      line: 32,
      before: 'const token = authorizationHeader.split(" ")[0];',
      after: 'const token = authorizationHeader.split(" ")[1];',
    },
    testCommand: "npm test",
    aiGenerated: false,
  };
}
