# Phase 02 security implementation report

## Implemented

- Helmet security headers.
- CORS origin allowlist via `ALLOWED_ORIGINS`; requests with no browser Origin are allowed for CLI/server clients.
- Express JSON and URL-encoded body limits (`REQUEST_BODY_LIMIT`, default 100kb).
- General API rate limit: 300 requests / 15 minutes.
- Appointment route rate limit: 20 requests / 15 minutes.
- Admin route rate limit: 60 requests / 15 minutes.
- Random server-generated request ID returned as `X-Request-Id`.
- Pino structured request/application logging; logger redacts authorization, cookies, password, token and secret fields.
- Zod validation for body, query and path parameters; strict write schemas prevent mass assignment.
- Profile update only permits `name` and `image`; role, blocked state and email are rejected.
- Appointment identity and price are server-derived from injected principal and service repository.
- Public service reads expose active records only; inactive catalogue access is admin-gated.
- Blocked principal check in authentication middleware.
- Central error handling, safe client messages, no stack trace in response, safe malformed JSON and payload-too-large handling.
- No hardcoded credentials. `.env` is ignored; `.env.example` contains Phase 02 variables only.
- No trust of `x-user-id`, request body user IDs, or client-provided role.
- No payment-success mutation route.

## Explicitly pending

- Better Auth session/token verification and JWT/JWKS validation: Phase 04.
- Actual authentication and role assignment from a verified provider: Phase 04.
- Database atomicity, durable uniqueness and concurrency protection: Phase 03.
- Stripe signature verification/idempotency: Phase 06.
- Frontend dashboard integration for the image-upload workflow and production secret configuration remain pending. The backend ImgBB proxy route is implemented in Phase 02; actual upload requires `IMGBB_API_KEY`.
- Production deployment hardening and infrastructure-level TLS/proxy policy: later deployment phase.

Protected endpoints currently return 501 `AUTH_INTEGRATION_PENDING` by default. This is intentional fail-closed behavior, not a temporary header-based auth bypass.
