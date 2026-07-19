# Agent instructions for PulseBoard

Instructions for automated agents (and new engineers) working in this
repository.

## Ground rules

- Read `docs/ARCHITECTURE.md` before proposing changes.
- Source code is the final authority. Documentation is evidence, not truth —
  verify claims against the implementation.
- Never widen a change beyond the failing behaviour.

## Commands

| Task | Command |
| --- | --- |
| Run the full test suite | `npm test` |
| Install dependencies | `npm install` |

## Key facts

- Authentication is bearer-token based: `Authorization: Bearer <token>`.
- `src/services/token-service.ts` is the only module that may construct or
  parse tokens.
- The Access Gate middleware (`src/middleware/require-auth.ts`) guards every
  protected route. If authenticated requests fail, start there and in the
  Token Service.
- The employee directory is deterministic; see `src/database/users.ts` for
  valid local credentials.
