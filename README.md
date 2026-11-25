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
