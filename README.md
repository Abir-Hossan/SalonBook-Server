# SalonBook Server

SalonBook Server is the Express and TypeScript API for the [SalonBook Client](https://github.com/Abir-Hossan/SalonBook-Client). It uses Mongoose and MongoDB for persistence, Better Auth for sessions, and server-side role checks for customer and admin operations.

## API capabilities

| Area | What the API handles |
| --- | --- |
| Catalogue | Public services, categories, search, pagination, and admin service management |
| Appointments | Available time slots, booking requests, overlap protection, confirmation, and cancellation |
| Accounts | Email and password, optional Google sign-in, customer profiles, and admin account controls |
| Payments | Stripe test-mode Checkout for confirmed, unpaid bookings and signed webhooks that record payments and update bookings |

## Local setup

Use Node.js 24, npm 10 or newer, and a MongoDB replica set. Create a local environment file from the example:

```bash
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set `BETTER_AUTH_SECRET` to the generated value in `.env`. Point `MONGODB_URI` and `MONGODB_DB_NAME` to the local replica set and development database. The example trusts the Client at `http://localhost:3000`. Use the same browser origin consistently.

```bash
npm run dev
```

Check [API health](http://localhost:5000/api/health) and [database/auth readiness](http://localhost:5000/api/ready). The development example seeds the demo catalogue at startup. To seed it explicitly against the database in `.env`, run `npm run build` followed by `npm run seed:catalog`.

## Configuration

| Variables | Purpose |
| --- | --- |
| `MONGODB_URI`, `MONGODB_DB_NAME` | Connection and explicit database name |
| `CLIENT_URL`, `ALLOWED_ORIGINS` | Client redirects and exact allowed browser origins |
| `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` | Auth origin and session signing secret |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google OAuth Web application credentials |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Optional Stripe test API key and webhook signing secret |
| `IMGBB_API_KEY` | Optional service and profile image uploads |
| `PORT`, `SALON_TIME_ZONE` | HTTP port and time zone used for booking dates |

## Verification

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

The GitHub Actions workflow runs the integration tests with a disposable MongoDB replica set. Run `npm test -- tests/unit` for unit tests. See the [Atlas test harness](PHASE04_1_SAFE_ATLAS_TEST_HARNESS.md) for an isolated Atlas test run.

## Deployment

Render builds the API with `npm run build` and starts it with `npm start`. Use `/api/ready` for health checks. Set the production `CLIENT_URL` and `BETTER_AUTH_URL` to the exact public HTTPS Client origin and include that origin in `ALLOWED_ORIGINS`. The Vercel Client proxies API requests to `SALONBOOK_API_URL`. Use a separate database and auth secret for Preview verification.

For Google sign-in through Better Auth, register `/api/better-auth/callback/google` on the public Client origin in your OAuth Web application. For Stripe Sandbox, send Checkout events to `/api/payments/webhook` on the API origin. Consult the [isolated staging runbook](https://github.com/Abir-Hossan/SalonBook-Server/blob/staging/admin-verification/docs/staging-admin.md) for the staging environment.

## Reference

- [OpenAPI contract](openapi.yaml)
- [Database schema](DATABASE_SCHEMA.md)
- [Repository contracts](docs/REPOSITORY_CONTRACTS.md)
