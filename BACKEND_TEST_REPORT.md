# Phase 02 backend test report

Unit coverage includes service filters, lifecycle transitions, concurrent booking and status updates, user permissions and transaction ownership. The Supertest suite covers health, API routing, validation, authorization and error envelopes.

## Latest verification evidence — 2026-11-21

The following results are based on terminal output supplied by the user from the current `server/` workspace. They are user-run checks, not an independent execution by the report author.

| Check | Result | Evidence / note |
|---|---|---|
| TypeScript typecheck | Passed | User reported no errors after `npm run typecheck`. |
| ESLint | Passed | User reported no errors after `npm run lint`. |
| Production build | Passed | User reported no errors after `npm run build`. |
| Unit tests | 48 passed | 12 service + 22 appointment + 14 users/transactions. |
| Integration tests | 20 passed | `tests/integration/api.test.ts`. |
| Total automated tests | **68/68 passed** | 4 test files passed; latest supplied run used Vitest 5.1.1. |
| Production dependency audit | 0 vulnerabilities | `npm audit --omit=dev`. |
| Full dependency audit | 0 vulnerabilities | `npm audit`. |

### Non-blocking warning

Vitest prints a Vite config-loader warning because `vitest.config.ts` uses ESM syntax while being loaded as CommonJS under the native config loader. The test run still completed successfully. This warning should be cleaned up separately; do not suppress it merely to make the output quiet.

### Historical results

Earlier reports of 66/66 tests and a 20-case loopback `EACCES` failure are historical and superseded by the latest user-supplied Windows run showing 68/68 passing. Keep historical logs only as historical records; do not use them as the current acceptance result.

## Acceptance status

Backend static checks, build, automated tests and npm audit have user-supplied passing evidence. Final Phase 02 acceptance still requires reconciliation of all project reports and review of the complete source/configuration. MongoDB persistence, real authentication, Stripe and deployment remain outside the current accepted scope and are paused.
