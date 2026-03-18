# ADR-001: JWT Over Session-Based Authentication

## Status

Accepted

## Date

2024-06-15

## Context

We needed to choose an authentication mechanism for GoldenApp's API. The two main options were:

1. **Session-based auth** — Server stores session state, client sends session cookie
2. **JWT-based auth** — Server issues signed tokens, client sends token in Authorization header

Our requirements:
- Stateless API servers for horizontal scaling
- Support for multiple client types (web, mobile, CLI)
- Fine-grained role-based access control
- Token revocation capability

## Decision

We chose **JWT tokens** with a **server-side session store** as a hybrid approach.

- JWTs carry claims (user ID, roles, expiry) for stateless request validation
- A session store (`src/auth/session-store.ts`) tracks active sessions for revocation
- Token validation happens in `src/auth/token-validator.ts` (pure functions, no side effects)
- The auth orchestration layer (`src/auth/auth-service.ts`) coordinates between token validation and session management

## Consequences

### Positive
- API servers can validate tokens without database calls for most requests
- `token-validator.ts` is easily testable — pure functions with no dependencies
- Role claims in JWT enable fast authorization checks
- Session store enables immediate token revocation

### Negative
- Hybrid approach adds complexity — two systems to maintain
- `auth-service.ts` has high coupling (depends on session-store, token-validator, middleware, logger)
- Risk of circular dependencies as auth logic interacts with middleware (this has already happened between `middleware.ts` and `auth-service.ts`)

### Risks
- JWT payload size could grow if we add too many claims
- Clock skew between servers could cause token validation issues

## Alternatives Considered

- **Pure session-based**: Rejected because it requires database lookup on every request
- **Pure JWT without session store**: Rejected because we need immediate revocation for security compliance
- **OAuth2 with external provider**: Deferred to a future iteration (scope too large for MVP)
