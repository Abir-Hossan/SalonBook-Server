# SalonBook Server

SalonBook Express and TypeScript API with Mongoose persistence and Better Auth. See [Phase 04 Part 1](PHASE04_PART1_REPORT.md) for authentication configuration, compatibility, and verification status.

## Requirements

- Node.js 20+
- npm 10+

## Setup

```bash
npm ci
# Configure the environment described below before starting.
npm run dev
```

Create a local .env from .env.example only if .env does not already exist. Configure a MongoDB replica set and supply BETTER_AUTH_SECRET and BETTER_AUTH_URL before starting the server. Health endpoint: `GET http://localhost:5000/api/health`.

For current requirements, deployment steps and verification, see [PROJECT_STATUS.md](PROJECT_STATUS.md).

### Authorize a specific Vercel Preview

For approval, deployment, and Admin acceptance, use the [isolated staging runbook](docs/staging-admin.md) and separate `render.staging.yaml`.

`ALLOWED_ORIGINS` is a comma-separated list of exact browser origins. The Server uses it for credentialed CORS, authenticated write-origin checks, and Better Auth's trusted origins. Enter only the scheme and host plus a nondefault port if applicable. Production-mode services require HTTPS. Leave out paths, trailing slashes, and wildcards.

For full Preview authentication, point Vercel's **Preview** `SALONBOOK_API_URL` at a dedicated HTTPS staging API ending in `/api`. Use a separate database and Better Auth secret, and configure the staging Server with the exact stable Preview origin:

```dotenv
NODE_ENV=production
CLIENT_URL=https://salonbook-client-git-completion-assignment-r-82c2f1-abir-hossan.vercel.app
BETTER_AUTH_URL=https://salonbook-client-git-completion-assignment-r-82c2f1-abir-hossan.vercel.app
ALLOWED_ORIGINS=https://salonbook-client-git-completion-assignment-r-82c2f1-abir-hossan.vercel.app
```

If an operator intentionally authorizes the reviewed Preview to use the shared API and its production data, append the exact Preview origin to that Server's existing `ALLOWED_ORIGINS` value. Preserve existing trusted entries and keep production `CLIENT_URL` and `BETTER_AUTH_URL` on the production Client. Only trust Preview deployments whose code is approved for production data access.

On Render, apply the environment change to the **API service the Preview actually uses**, then deploy and wait for `/api/ready`. If the Vercel Preview API target changes, redeploy the Client Preview. A successful preflight returns `204` and echoes the exact origin with credentials allowed. Verify email sign-in and `/salon-api/auth/me` using a dedicated test account in the protected Preview. OAuth callbacks also need their provider-specific staging configuration when tested.

## Scripts

- `npm run dev` — tsx watch server
- `npm run typecheck` — strict TypeScript check
- `npm run lint` — ESLint
- `npm test` — Vitest + Supertest suites
- `npm run build` — production TypeScript build
- `npm start` — run compiled `dist/server.js`

Run `npm test -- tests/unit` for the service-level tests. The Supertest integration suite additionally requires permission to connect to a local HTTP listener.

In the in-memory repository, concurrent requests for the same appointment slot produce one reservation. Status updates compare the current appointment status before taking effect, so a concurrent confirmation and customer cancellation cannot both succeed.

## Important boundaries

- The running server uses MongoDB repositories. In-memory adapters support isolated tests.
- Protected routes use server-validated sessions and domain roles from MongoDB.
- The frontend reads public services from this API. Set `SEED_DEMO_CATALOG=true` in development to insert missing sample services.
- See `API_DOCUMENTATION.md`, `DATABASE_SCHEMA.md`, `PROJECT_PLAN.md`, `DEVELOPMENT_PROGRESS.md`, `BACKEND_IMPLEMENTATION_REPORT.md`, and `BACKEND_TEST_REPORT.md`.

## Service image uploads

`POST /api/admin/images/service` accepts a PNG, JPEG, or WebP file as the raw request body, up to 5 MiB. Supply an authenticated admin session and configure `IMGBB_API_KEY` on the server. Use the returned image URL when saving the service. The admin form sends the selected image and saves the returned URL with the service.
