# SalonBook Phase 04.1 Task 04 — Safe Atlas test harness

**Local verification: PASS. Live Atlas verification: NOT VERIFIED.** All database tests in this task ran against an isolated MongoDB 8.0.16 replica set bound to loopback. No Atlas DNS query, connection, database operation, or cleanup ran. Application source, dependencies, and environment files were preserved.

## Changes

- Updated `tests/integration/mongo-atlas.test.ts` and `tests/integration/better-auth.test.ts` to share test-only connection and cleanup logic. All six appointment cases and all eight Better Auth cases and assertions were retained.
- Added `tests/fixtures/qa-database.ts`, `tests/integration/qa-database.test.ts`, and `tests/unit/qa-target.test.ts`.
- Updated the run instructions in `PHASE03_ATLAS_VERIFICATION.md` and added this report.

## Environment

| Variable | Purpose |
|---|---|
| `NODE_ENV=test` | Required by the test harness. Vitest defaults to test mode when NODE_ENV is unset. |
| `SALONBOOK_ATLAS_QA_MODE=confirmed-disposable` | Set only after the owner confirms a dedicated QA cluster, no production data or credential access, authorization for fixture writes and ID-scoped deletion, and transaction support for Better Auth. |
| `SALONBOOK_ATLAS_QA_HOST` | Independently confirmed bare Atlas QA SRV hostname. |
| `SALONBOOK_ATLAS_TEST_URI` | Dedicated authenticated Atlas SRV URI for Phase 03. |
| `SALONBOOK_AUTH_ATLAS_TEST_URI` | Separate explicit URI input for the Better Auth suite. The suite never falls back to the Phase 03 variable. |
| `SALONBOOK_PHASE03_LOCAL_TEST_URI` | Optional loopback replica-set URI for the six Phase 03 cases and local cleanup tests. |
| `SALONBOOK_AUTH_TEST_URI` | Existing optional loopback replica-set URI for Better Auth. |

Provide secrets through an approved process secret channel. Supply at most one target per suite. Atlas checks require a matching pinned SRV hostname ending in mongodb.net, reject the known application endpoint and production-labelled targets, and reject transport options that disable TLS or certificate checks. If MONGODB_URI is set but cannot be safely compared as an Atlas SRV endpoint, the Atlas harness refuses it. Endpoint checks are secondary to owner confirmation and cluster-scoped credentials.

## Namespace and fixture ownership

Each suite generates a fresh UUID-derived database name beginning with `salonbook_qa_` or `salonbook_auth_qa_`. Before setup writes, it verifies the exact namespace format, requires a disconnected Mongoose singleton, disables model auto-creation and auto-indexing on connect, then verifies the selected database and checks that it contains no collections. The driver, database object and active connection identity must still match at cleanup.

On that client's connection, command monitoring keeps only the collection and ObjectIds associated with acknowledged inserts and returned upsert IDs. It covers fixtures and application-generated records, including credentials created by the legacy migration and Better Auth's users and sessions. The collection allowlist covers `Appointments`, `Services`, `Users`, `Transactions`, `BetterAuthAccounts`, `BetterAuthSessions`, `BetterAuthVerifications` and `CustomerSessions`. Command data, credential fields and URI values are never emitted by the tracker.

## Cleanup

Cleanup issues only `deleteMany({ _id: { $in: trackedIds } })` for collections with a nonempty confirmed ID set. It records the successfully inserted prefix of a partial ordered batch and leaves failed and unattempted IDs alone. Transaction-aborted or already-deleted IDs match no documents. Successful cleanup clears the tracking entries, making repeated cleanup safe. If a write result is ambiguous, it cleans confirmed IDs only and reports incomplete cleanup. A failed cleanup or uncertain connection identity never triggers a broader operation.

Indexes and empty generated namespaces remain in place. The harness does not remove indexes, collections, or databases. If a future run is interrupted before acknowledgement, an owner may need to review its isolated namespace for leftovers. The current tracker covers the insert and update-upsert command shapes exercised by these suites. A future write path using another command shape needs corresponding tracking coverage.

## Atlas permissions

Use an owner-approved credential restricted to the QA cluster. Allow collection listing for the empty-namespace check, collection and index creation, index listing, fixture inserts, reads and counts, updates including credential upserts and expiry/block checks, and document deletion for acknowledged fixture IDs. Better Auth uses the existing Mongoose client with transactions, so the target must support multi-document transactions. The test suite does not require collection or database drop privileges. Since the harness supplies a generated database name, a grant for only the database listed in the URI will not cover the run. Keep any cross-database QA permissions confined to the dedicated QA cluster. [Atlas database users and cluster scope](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/)

## Local evidence

| Check | Result |
|---|---|
| Initial complete server test run on loopback | PASS — 90 tests |
| Repeated complete server run after adding target validation tests | PASS — 92 tests across 10 files |
| Phase 03 appointment cases | PASS — 6 on loopback |
| Better Auth cases including identity and ownership | PASS — 8 on loopback, including mocked OAuth |
| Target-validation tests | PASS — 2, no network access |
| Cleanup test | PASS — repeated across two unique namespaces, including an acknowledged upsert, partial ordered insert and two unrelated IDs written through an independent client |
| Local post-run inventory | PASS — 0 documents across 8 generated QA namespaces |
| Server typecheck, lint and build | PASS — all three commands exited 0. |
| Live Atlas Phase 03 and Better Auth | NOT VERIFIED — neither suite connected to Atlas |

## Remaining Atlas verification

An owner-confirmed dedicated cluster, its independently confirmed hostname, securely injected dedicated URIs, matching role privileges, and DNS/TLS connectivity from the intended runner are still required. After approval, run the Phase 03 and Better Auth suites with their respective Atlas variables and record the isolation and cleanup evidence. Live verification remains open.
