# Authentication

## Token format

PulseBoard bearer tokens are deterministic signed strings:

```
pb1.<base64url(userId)>.<signature>
```

They are issued by `issueToken(userId)` and checked with `verifyToken(token)`
in `src/services/token-service.ts`. `verifyToken` returns the user id for a
valid token and `null` for anything malformed or tampered with.

## Header contract

Authenticated requests must send:

```
Authorization: Bearer <token>
```

The Access Gate (`src/middleware/require-auth.ts`) is responsible for:

1. Reading the `Authorization` header.
2. Confirming the `Bearer` scheme.
3. Extracting the token — the part **after** the space, not the scheme word.
4. Verifying the token with the Token Service.
5. Resolving the user from the User Vault.

Any failure returns `401 Unauthorized` with a human-readable error.

## Common pitfalls

- `authorizationHeader.split(" ")` yields `["Bearer", "<token>"]`. Index `[1]`
  is the token. Passing index `[0]` sends the literal string `Bearer` into
  token verification, which will always fail.
- Header lookups must tolerate both `authorization` and `Authorization`.

## Testing

`tests/authentication.test.ts` exercises the full path: issue a token, log
in, build an authorized request, and pass it through the Access Gate. Run it
with `npm test`.
