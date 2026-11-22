# SalonBook Phase 04 Part 1

## Architecture audit

| Area | Findings |
| --- | --- |
| Source and builds | `outputs/Client` is the existing Next.js App Router application with React, TypeScript, Tailwind, Next rewrites and its own ESLint and dependency lockfile. `outputs/server` is the Express 4 API with strict TypeScript, ESLint, Vitest, Supertest and a separate lockfile. The server continues to emit CommonJS. Node-aware TypeScript resolution preserves dynamic imports of Better Auth's ESM modules. |
| Frontend auth dependencies | The Client already declares Better Auth (1.7.26 in the inspected install) and uses its existing SalonBook REST routes through the Next proxy. It retains its existing design and client configuration. |
| Legacy auth | Public registration and email sign-in previously generated opaque 32-byte cookie tokens. MongoDB stored their SHA-256 digests in `CustomerSessions` with TTL expiry. The credential format is Node scrypt with a random 16-byte salt represented as hexadecimal text and a 64-byte derived key stored as `salt:key`. The earlier Google route exchanges an authorization code, uses state and PKCE, and requires provider-verified email. There is no JWT principal path. |
| Data model | `Users` has a unique normalized email, optional unique Google subject, and Mongoose ObjectId primary key. `Appointments.customerId` and `Transactions.customerId` refer to that ObjectId. Appointments also reference `Services` and transactions reference appointments. Existing password fields are excluded from Mongoose queries by default. |
| Authorization | Existing middleware rejects unauthenticated and blocked principals. Customer appointment and transaction endpoints enforce ownership, and admin lists and mutations enforce the admin role. Admin blocking of administrative users remains prohibited. Public catalogue and health routes remain public. The customer dashboard, profile, profile upload, payment checkout and admin dashboard, service management, image upload and user management use the same principal boundary. |
| Startup and middleware | The active connection is `src/database/connection.ts`. It applies an explicit MongoDB selection timeout and creates existing indexes. `src/config/database.ts` is a separate unused connection helper. The active Express order is request context, Helmet, CORS, logging and rate limits, raw Stripe webhook, origin checks and the auth handler, then application body parsers and routers. |
| Verification baseline | The existing suites cover API and domain behavior and contain six opt-in Atlas tests. Earlier Phase 03 documentation records a DNS timeout. A production MongoDB database was outside the verification scope. |

## Implementation and compatibility

- The backend pins Better Auth and its Mongo adapter to 1.7.27. The adapter and Mongoose resolve to MongoDB driver 6.20.0. Better Call 1.4.6 exposes the bounded Node request adapter used by the HTTP handler.
- Better Auth shares Mongoose's connected MongoClient and database. Registration and OAuth writes use transactions. It uses the same `Users` collection and the same ObjectId, with `BetterAuthAccounts`, `BetterAuthSessions` and `BetterAuthVerifications` for authentication-specific records. The new indexes enforce unique provider credentials and expire sessions. Startup and shutdown use the existing Mongoose lifecycle.
- Existing `/api/auth/register`, `/sign-in`, `/me` and `/sign-out` paths retain their REST envelope or empty response. Registration and sign-in delegate to Better Auth. Existing valid legacy sessions remain recognized until expiration or revocation. The existing Google routes remain available to the current frontend and use exact Google subject ownership.
- On successful authentication with a legacy credential, the backend inserts a Better Auth hash in the credential account for the same ObjectId. It uses bounded inputs, constant-time legacy hash comparison, and a unique account key. Legacy password fields, roles, blocked flags, profile fields and foreign keys are preserved.
- The native `/api/better-auth` routes include `POST /sign-up/email`, `POST /sign-in/email`, `POST /sign-in/social`, `GET /callback/google`, `GET /get-session` and `POST /sign-out`. Google OAuth requires a verified email and uses the Google subject for existing account resolution. Automatic linking by email is disabled. A Google identity that shares an email with an existing unlinked credential account is rejected. Legacy Google accounts are linked only after the provider returns their existing subject.
- Registration, Google sign-in and unremembered email sign-in have 12-hour server-side expirations. Remembered email sign-in has a 30-day expiration. Session cookies use HttpOnly, SameSite=Lax and Secure with HTTPS. Server-side role, status and ownership evaluation uses the current domain user. Trusted origins, callback URL validation, body limits, rate limits and sensitive-field redaction protect authentication and the original REST routes.

The adapter uses a transaction-capable MongoDB replica set or sharded cluster. The database account needs read and write access and permission to create the documented indexes. Deployment with existing data should verify the existing unique indexes and provider mappings in a non-production environment before rollout.

## Configuration

| Variable | Requirement |
| --- | --- |
| `BETTER_AUTH_SECRET` | Required at server startup. Generate a high-entropy value of at least 32 characters and store it server-side. For example, generate 48 random bytes using Node locally. Keep it stable across restarts and instances. |
| `BETTER_AUTH_URL` | Required origin serving Better Auth routes. Use `http://localhost:5000` locally if the API runs there. Production requires HTTPS and an origin that actually routes `/api/better-auth/*` to Express. |
| `MONGODB_URI`, `MONGODB_DB_NAME` | Use a transaction-capable instance. Set the database name explicitly when the target differs from the URI default. |
| `CLIENT_URL`, `ALLOWED_ORIGINS` | Set the application origin and exact allowed request and callback origins. Add the API origin if the browser makes same-origin auth writes there. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Set both to enable Google. Register `<BETTER_AUTH_URL>/api/better-auth/callback/google` in the Google console. Keep the existing `<CLIENT_URL>/salon-api/auth/google/callback` redirect registered while the current frontend uses that route. |
| `SALONBOOK_AUTH_TEST_URI` | Test-only. Use `mongodb://127.0.0.1:<port>/?replicaSet=<name>`. The tests accept only this explicit loopback form and use a fresh random database name. |

Without the test URI, Vitest skips the local database suite. To run it on a disposable local replica set, set the test URI and run `npm test -- tests/integration/better-auth.test.ts`. To run all suites, use `npm test`. The independent Atlas suite still needs the dedicated URI described in [Phase 03 Atlas Verification](PHASE03_ATLAS_VERIFICATION.md).

## Files

| Change | Files |
| --- | --- |
| Added | `src/modules/auth/better-auth.ts`, `src/modules/auth/legacy-password.ts`, `tests/integration/better-auth.test.ts`, `tests/unit/legacy-password.test.ts`, this report |
| Updated | `src/app.ts`, `src/server.ts`, `src/config/env.ts`, `src/config/logger.ts`, `src/modules/auth/auth.routes.ts`, `src/modules/auth/google.routes.ts`, `.env.example`, `package.json`, `package-lock.json`, `tsconfig.json`, `README.md` |

Existing schema, repository, route contract and test files were reviewed. The Client and database-domain source files have no Part 1 edits. No .env files were written.

## Verification and remaining work

| Check | Status | Evidence |
| --- | --- | --- |
| Server typecheck | PASS | `npm run typecheck`, exit 0. |
| Server ESLint | PASS | `npm run lint`, exit 0. |
| Unit and integration suite | PASS | `npm run test` with a loopback MongoDB 8.0.16 replica set, 83 passed, 6 skipped. Includes eight MongoDB-backed Better Auth cases and two legacy password tests. |
| Production build | PASS | `npm run build`, exit 0. |
| Compiled server startup | PASS | Real local MongoDB connection, HTTP health and registration returning 201. |
| Google OAuth mocked provider | PASS | Code exchange, PKCE URL and callback, legacy Google subject reuse, new user creation, existing email collision rejection and untrusted redirect rejection. |
| Phase 03 live Atlas suite | SKIPPED | Six tests require a dedicated Atlas URI. Local MongoDB results do not close Phase 03 Atlas verification. |
| Live Google provider / production data | NOT VERIFIED | OAuth transport was mocked. No production connector or data was used. |

Vitest reported its existing CommonJS configuration warning. Typecheck, tests and build completed successfully.

Part 2 will integrate the native Better Auth browser flows, verify cookie and redirect behavior through the frontend proxy, verify live Google OAuth using the target configuration, check booking resume in the browser, and complete acceptance. Email verification and password reset delivery require a configured mail service and were outside Part 1. Email/password accounts are not automatically linked to Google accounts.
 
## Sources

- [Better Auth Express integration](https://better-auth.com/docs/integrations/express)
- [Better Auth MongoDB adapter](https://better-auth.com/docs/adapters/mongo)
- [Better Auth Google provider](https://better-auth.com/docs/authentication/google)
- [Better Auth users and accounts](https://better-auth.com/docs/concepts/users-accounts)
