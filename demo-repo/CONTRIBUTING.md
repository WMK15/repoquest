# Contributing to PulseBoard

## Conventions

- TypeScript strict mode everywhere; no `any` unless quarantined and commented.
- One component per directory: routes never import middleware, middleware
  never imports routes. The Token Service is the only module both may use.
- Prefer the smallest change that makes the failing test pass, then refactor
  in a follow-up.

## Workflow

1. Reproduce the problem with a test (or find the failing test).
2. Trace the request path in `docs/ARCHITECTURE.md` before editing code.
3. Make the smallest safe correction.
4. Run `npm test` and confirm the suite is green.

## Testing

- Vitest, verbose reporter. `npm test` runs everything.
- Authentication changes must keep `tests/authentication.test.ts` green.

## Review checklist

- [ ] Does the change touch the smallest possible surface?
- [ ] Does documentation still match the implementation?
- [ ] Are all tests passing locally?
