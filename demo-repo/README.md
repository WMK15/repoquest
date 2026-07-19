# PulseBoard

PulseBoard is Pulse Systems' internal task-management application. Employees
sign in with their company credentials and manage team tasks behind an
authenticated API.

## What lives here

| Area | Path | Purpose |
| --- | --- | --- |
| Login Interface | `src/client/login.ts` | Client entry point; stores the session token |
| Authentication Route | `src/routes/auth.ts` | Login endpoint; checks credentials |
| Token Service | `src/services/token-service.ts` | Issues and verifies bearer tokens |
| Access Gate | `src/middleware/require-auth.ts` | Middleware protecting every private route |
| User Vault | `src/database/users.ts` | Employee directory (seeded locally) |

## Authentication in one paragraph

A user logs in through the **Login Interface**, which posts credentials to the
**Authentication Route**. If the **User Vault** confirms them, the **Token
Service** issues a bearer token. Every later request carries
`Authorization: Bearer <token>`, which the **Access Gate** middleware verifies
before resolving the user.

## Running the tests

```bash
npm test
```

The authentication suite in `tests/authentication.test.ts` covers the full
login → token → protected-request path.

## Further reading

- `docs/ARCHITECTURE.md` — system boundaries and request flow
- `docs/authentication.md` — token format and middleware contract
- `CONTRIBUTING.md` — engineering conventions
- `AGENTS.md` — instructions for automated agents working in this repo
