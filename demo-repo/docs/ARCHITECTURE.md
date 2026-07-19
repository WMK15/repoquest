# PulseBoard Architecture

PulseBoard is deliberately small: five components in a single request path.

## Request flow

```
Login Interface  (src/client/login.ts)
      ↓  credentials
Authentication Route  (src/routes/auth.ts)
      ↓  verified user
Token Service  (src/services/token-service.ts)
      ↓  bearer token
Access Gate  (src/middleware/require-auth.ts)
      ↓  resolved user
User Vault  (src/database/users.ts)
```

## Components

### Login Interface
The only client-side module. It calls the authentication route, stores the
returned token, and builds authorized requests with an
`Authorization: Bearer <token>` header.

### Authentication Route
Validates the login payload, asks the User Vault to verify credentials, and
returns a token from the Token Service. Never issues tokens for unverified
users.

### Token Service
Tokens are deterministic, signed strings in the format
`pb1.<payload>.<signature>`. `issueToken` and `verifyToken` are the only
public functions; nothing else in the codebase constructs or parses tokens.

### Access Gate
Middleware in front of every protected route. It extracts the bearer token
from the Authorization header, verifies it with the Token Service, and loads
the user from the User Vault. A request that fails at any step receives
`401 Unauthorized`.

### User Vault
An in-memory employee directory seeded at boot. In production this is fed by
the HR sync; locally it is a fixed list.

## Design rules

1. The Token Service is the single authority on token format.
2. The Access Gate must pass **only the token** — never the whole header —
   into `verifyToken`.
3. Protected routes never touch credentials; only the Authentication Route
   sees passwords.
