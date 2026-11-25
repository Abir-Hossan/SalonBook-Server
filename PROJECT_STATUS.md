# SalonBook project status

Updated 25 November 2026.

## Release status

**Vercel Preview and CI passed for the current release candidate. Assignment submission remains blocked on the Client commit requirement.** See the latest reconciliation below.

| Component | Location |
| --- | --- |
| Client | [SalonBook-Client](https://github.com/Abir-Hossan/SalonBook-Client) · [completion branch](https://github.com/Abir-Hossan/SalonBook-Client/tree/completion/assignment-readiness) |
| Server | [SalonBook-Server](https://github.com/Abir-Hossan/SalonBook-Server) · [completion branch](https://github.com/Abir-Hossan/SalonBook-Server/tree/completion/assignment-readiness) |
| Existing client deployment | [salonbook-client-ivory.vercel.app](https://salonbook-client-ivory.vercel.app/) |
| Server deployment | [salonbook-server-p0f1.onrender.com](https://salonbook-server-p0f1.onrender.com/api/ready) |

Next.js serves the public site and dashboards, using same-origin rewrites to the Express API. TypeScript domain modules enforce booking and account rules. Mongoose persists services, users, appointments and transactions. Better Auth manages browser cookies and signs five-minute API JWTs. A bearer JWT still requires a live, matching Better Auth session and an authorized, unblocked database account. Stripe Checkout remains in test mode.

## Assignment checklist

| Requirement | Implementation and acceptance |
| --- | --- |
| Six active services and featured homepage | Home requests six active records. The explicit catalog bootstrap inserts the six supplied services without overwriting existing records. Phase 4 observed eight active public catalogue services and verified six featured cards in isolated browser CI. |
| Service listing, details, categories, search, sorting and filtering | Integrated with Express. Public catalogue uses server pagination, category filters, search and price sorting. The public catalogue and service details reached the deployed API during Phase 4. |
| Customer and admin auth | Existing signup, signin, signout, blocking, roles, redirects and booking resume are preserved. Added remember-me renewal and session-bound JWT support. The CI suite verifies cookie flags under HTTPS configuration and session renewal. Live Google OAuth and the deployed Vercel cookie path remain acceptance items. Password recovery and email verification require mail delivery configuration. |
| Appointment booking, conflicts and ownership | Availability comes from the server. The existing six start times, single shared salon capacity and future-date rule are retained. New records snapshot price, duration, name and image. A MongoDB unique multikey index protects concurrent overlap. Existing appointments are checked using their stored duration or the current service duration. Cancellation releases the reservation. Validate existing future rows and indexes on a disposable Atlas database before rollout. |
| Customer portal | Displays server-paginated appointments, status, details, cancellation, profile and payment history. Upcoming appointments exclude cancelled and earlier dates. |
| Admin portal | API-backed statistics, service CRUD and activation, appointment actions, customer blocking/unblocking, profiles, and paginated transaction history. Role enforcement stays on the server. |
| ImgBB | Service and profile upload routes retain file type, signature, size and auth checks. Forms persist the provider URL. Provider and proxy acceptance remain open. |
| Stripe and transactions | Checkout requires an owned, confirmed, unpaid booking. Signed test webhooks update the appointment and ledger transaction atomically. Duplicate event handling, closed sessions and definitive provider rejections are handled. Admins can release a recorded unpaid checkout after Stripe confirms its expiry. A stale ambiguous attempt whose session ID was never saved still requires operator reconciliation in Stripe. Live charges are disabled. |
| UX and responsive QA | Existing layouts and design assets retained. Public homepage and catalogue were inspected on the existing Vercel build. Chromium verified public and auth layout widths at 390, 768, 1024 and 1440 pixels and exercised booking, account and admin flows against disposable MongoDB. Deployed HTTPS browser acceptance remains open. |
| Documentation and delivery | Both READMEs updated. Historical reports retained. OpenAPI describes the current readiness, availability and payment routes. |
| Separate repositories and Git history | The Client and Server remain independent. The Client completion branch now contains 17 reachable commits, including both `main` commits. The assignment requires 20 meaningful Client commits and 12 Server commits. The Client is three commits short after a history-preserving merge. |

## Phase 4 verification

| Status | Evidence |
| --- | --- |
| VERIFIED | Public Render readiness returned `status: ready` after the free-tier wake-up. The Vercel `/salon-api/health` rewrite returned production API JSON. The catalogue displayed eight live services and a service detail displayed bookable times. |
| FAILED / BLOCKED | GitHub recorded a [failed Vercel check](https://vercel.com/abir-hossan/salonbook-client/GVPLRfgiNpvmPknvb8yrej8xeGKq) on the prior Client head. The Build Logs require sign-in and the exact error remains unconfirmed. The updated Client head also reported a [failed Vercel check](https://vercel.com/abir-hossan/salonbook-client/DATb7n2ndveExs3cnHvN4isukcs1) after the GitHub CI jobs passed. |
| FIXED | Builds, rewrites and SSR reads now use one validated Client API target. API calls have a timeout, and catalogue reads handle cold-start HTML as a temporary API failure. The appointment dialog uses native keyboard and focus behavior. |
| FIXED | The Server verifies the checkout amount, currency and booking identifiers before storing a Stripe test session or returning its link. The regression test covers mismatch rejection, owner and status rules, idempotent retry and session reuse. |
| PASSED | [Server CI](https://github.com/Abir-Hossan/SalonBook-Server/actions/runs/45650810875) ran npm ci, TypeScript, ESLint, production build and **109 tests in 12 suites**. The tests used disposable MongoDB and controlled Stripe, OAuth and image-provider responses. |
| PASSED | [Client CI](https://github.com/Abir-Hossan/SalonBook-Client/actions/runs/45650610582) ran npm ci, two configuration tests, TypeScript, ESLint, production build and Chromium. Browser coverage included catalogue retry, auth, booking, payment return screens, profile, admin catalogue CRUD and blocking, keyboard dialog behavior and four viewport widths. npm ci reported zero vulnerabilities in both repositories at the time of the run. |
| NOT VERIFIED | Live authenticated booking and admin, Google OAuth, ImgBB, an actual Stripe test-mode payment and direct Atlas TLS from hosting. Password recovery and email verification still require an email delivery integration. |

## Final release audit — 25 November 2026 (historical snapshot)

| Area | Finding |
| --- | --- |
| Release | **BLOCKED** pending confirmation of a successful Vercel Preview for the exact Client PR head. The public production smoke and isolated CI runs passed. |
| Vercel Preview | The project owner reports setting `SALONBOOK_API_URL` for Preview and seeing a Ready deployment. The latest Vercel deployment status visible on Client head `b6014a4c86b9d6a8fc1f23c457597e71bc481044` still shows [deployment failed](https://vercel.com/abir-hossan/salonbook-client/DATb7n2ndveExs3cnHvN4isukcs1). The deployment dashboard requires sign-in. The Ready deployment's ID, environment, source SHA and resolution of the earlier build error remain independently unverified. |
| Client CI | [Attempt 2 passed](https://github.com/Abir-Hossan/SalonBook-Client/actions/runs/45650610582/attempts/2) for Client PR head `b6014a4`. The verification job passed configuration tests, TypeScript, ESLint and the production build. The Chromium rerun used Server `dcd633857ad1e50ca638fcc39b7b32ec765cc6f8` and passed booking, authentication, administration and layout checks at 390, 768, 1024 and 1440 px. These tests used an isolated stack. |
| Server CI | [Run 45651204922 passed](https://github.com/Abir-Hossan/SalonBook-Server/actions/runs/45651204922) for the audited Server head `dcd6338`. TypeScript, ESLint, the production build and 109 tests across 12 files passed with disposable MongoDB. |
| Live smoke | Verified at desktop width on the [public Client](https://salonbook-client-ivory.vercel.app/). The homepage showed six featured services, the catalogue showed eight, and a service detail displayed six availability options. The same-origin health and availability routes returned successful API responses. Live mobile and tablet widths remain unverified. |
| Merge readiness | [Client PR #1](https://github.com/Abir-Hossan/SalonBook-Client/pull/1) and [Server PR #1](https://github.com/Abir-Hossan/SalonBook-Server/pull/1) are open drafts and GitHub reported no merge conflicts. Server verification passed. Keep the Client in draft until the Vercel deployment and GitHub check agree on the exact head. |
| Live acceptance | Deployed authentication, booking and admin flows, Google OAuth, ImgBB, Stripe test-mode payment and a direct Atlas TLS check from the host remain unverified. Email delivery is still required for password recovery and verification. |

Open the Ready deployment in Vercel and confirm its environment is Preview and its source SHA is `b6014a4c86b9d6a8fc1f23c457597e71bc481044`. If its source differs, deploy that exact head. Confirm the successful deployment status on Client PR #1 before marking it ready for review.

## Release reconciliation — 25 November 2026

| Area | Current evidence |
| --- | --- |
| Release | **BLOCKED for assignment submission**. The current Client Preview and both repositories' CI passed. The Client is still three meaningful commits short. |
| Client and Preview | Client head `c954028a3495d97c1d07efa317530d18b7f68e59`. Vercel's [commit status](https://github.com/Abir-Hossan/SalonBook-Client/commit/c954028a3495d97c1d07efa317530d18b7f68e59) reported **Deployment has completed** at 22:40 Dhaka time. The [Vercel GitHub App](https://github.com/Abir-Hossan/SalonBook-Client/pull/1#issuecomment-7155443708) identified the same [deployment](https://vercel.com/abir-hossan/salonbook-client/5ZSM4HL4JDpnmL21e3NarhcdEPve) as **Ready** and linked its [Preview URL](https://salonbook-client-git-completion-assignment-r-82c2f1-abir-hossan.vercel.app). The authenticated dashboard and protected Preview runtime were inaccessible. The historical failed status on `b6014a4` remains on that commit. Its underlying build error and the reported Ready Production deployment's source SHA could not be independently confirmed. |
| Client configuration | Preview and Production builds require a public HTTPS Express `/api` URL. Next.js uses one validator for rewrites and SSR reads. Missing or invalid configuration produces an explicit build error without echoing the value. The current Preview passed with no repository configuration change. |
| Client CI | [Run 45656277232](https://github.com/Abir-Hossan/SalonBook-Client/actions/runs/45656277232) passed npm ci, configuration tests, TypeScript, ESLint, the production build and Chromium acceptance. The browser job checked out Server `c890f75d69bfaae1d7322976b4dd5efeb41a04ab` and covered category-request recovery, read-only payment-status retry and keyboard navigation, along with the existing end-to-end checks. |
| Server CI | [Run 45654460876](https://github.com/Abir-Hossan/SalonBook-Server/actions/runs/45654460876) passed TypeScript, ESLint, the production build and 109 tests across 12 files for `c890f75d69bfaae1d7322976b4dd5efeb41a04ab`, the Server head audited before this documentation update. |
| Git history | Client `main` has 2 commits, both reachable from the completion head. The completion branch has 17 reachable commits, including 15 beyond `main`. A history-preserving merge would retain all 17 existing commits. The assignment requires 20 meaningful commits, leaving a deficit of 3. |
| Public connectivity | The public Client [API health rewrite](https://salonbook-client-ivory.vercel.app/salon-api/health) returned production API JSON with status `ok`. The [Render readiness endpoint](https://salonbook-server-p0f1.onrender.com/api/ready) returned `ready`. Those responses do not identify the Client production deployment SHA. |
| Live acceptance | Protected Preview runtime, live authenticated booking and administration, Google OAuth, ImgBB uploads, Stripe test-mode payment, live mobile and tablet rendering, and a direct host-to-Atlas TLS check remain unverified. Password recovery and email verification still need email delivery. |

Both PRs remain drafts. Confirm the Production deployment source and perform an authenticated read-only Preview health check in Vercel. Complete the remaining assignment work through genuine changes and use a history-preserving merge after review.

## Deploy and verify the Server

1. Create or connect a Render Node Web Service to the Server repository and select the completion branch for staging. Use the supplied free staging `render.yaml` Blueprint or the same settings in the service dashboard. The build command is `npm ci --include=dev && npm run build`. The start command is `npm start`, which runs `dist/server.js`. The health check is `/api/ready`. Render supplies `PORT`.
2. Set `NODE_ENV=production`, `MONGODB_URI`, `MONGODB_DB_NAME`, `BETTER_AUTH_SECRET` (at least 32 characters), `BETTER_AUTH_URL`, `CLIENT_URL`, and `ALLOWED_ORIGINS`. The URL settings must identify the public HTTPS Client origin. Set `SALON_TIME_ZONE` to the intended salon IANA timezone; it defaults to UTC. Configure `TRUST_PROXY` only after confirming the host's trusted proxy path.
3. Verify the Atlas database user and index permissions and allow the hosting service's egress addresses in Atlas. Check SRV lookup, the TLS handshake, and MongoDB authentication from the actual hosting environment. Use `SALONBOOK_ATLAS_TEST_URI`, `SALONBOOK_ATLAS_QA_HOST` and `SALONBOOK_ATLAS_QA_MODE=confirmed-disposable` for the isolated acceptance suite. The QA harness rejects the application database.
4. From an authorized machine with the same Atlas configuration in its environment, run `npm ci` and `npm run build` in the Server checkout, then run `npm run seed:catalog` and verify the active count. The Render free tier has no interactive shell. Create the intended operator through normal registration. With that account's owner-authorized email configured as `SALONBOOK_BOOTSTRAP_ADMIN_EMAIL`, run `npm run bootstrap:admin` in a controlled Server environment. Remove the temporary setting after the role is confirmed.
5. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and the exact HTTPS Client callback `/api/better-auth/callback/google`. Add `IMGBB_API_KEY` for image uploads. Configure a Stripe test secret key and `STRIPE_WEBHOOK_SECRET`, then register the public Server `/api/payments/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`. Keep all values in the provider environment.

### Startup failures in Render

Open the failed deploy's **Logs** and find the JSON entry whose message is `SalonBook API failed to start.` Read `step`, `error.name`, `error.message`, `error.code` and `causes`. The stack contains code locations. Startup keeps a nonzero exit status on failure and binds the port only after database and auth initialization succeed.

| Step or code | Check |
| --- | --- |
| `environment.validate` or `auth.validate` | Correct the named environment variable. Use the public Client HTTPS origin for `BETTER_AUTH_URL` and `CLIENT_URL`. Include that exact origin without a trailing slash in the comma-separated `ALLOWED_ORIGINS`. |
| `mongodb.configure` or `mongodb.connect` | Check Render's `MONGODB_URI` and database name. `MONGODB_DB_NAME` overrides the database name in the URI. Use a transaction-capable Atlas connection and leave TLS verification enabled. For DNS or TLS errors, use the nested code and check the Atlas cluster state, Render outbound IP allowlist and certificate path. Error code 18 indicates authentication failure. |
| `mongodb.indexes.<collection>`, code 13 | Check that the application database user can create collections and indexes and read/write documents on the selected database. A database-scoped `readWrite` role supplies these actions. An Atlas UI project role is separate from a database user role. |
| `mongodb.indexes.<collection>`, codes 11000, 85 or 86 | Inspect existing data and index definitions on the named collection. These indicate a duplicate key or a conflicting index definition. Resolve through a reviewed data/index migration. |
| `http.listen` | Check Render's `PORT` and whether another process owns it. |

See [Atlas database users](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/) and [Render's Atlas connection guide](https://render.com/docs/connect-to-mongodb-atlas).

## Deploy and verify the Client

The public Client currently reaches `https://salonbook-server-p0f1.onrender.com/api`. For Preview, read the first error in the authenticated Vercel Build Logs. Check the Preview-specific `SALONBOOK_API_URL` if the error identifies it. Full authenticated preview acceptance should use an isolated HTTPS API and database with Better Auth configured for the stable preview Client origin.

Official references: [Render Node web services](https://render.com/docs/web-services), [Render shell access](https://render.com/docs/ssh), [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/), [Vercel private DNS error](https://vercel.com/docs/errors/DNS_HOSTNAME_RESOLVED_PRIVATE), [Better Auth sessions](https://better-auth.com/docs/concepts/session-management), [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment).
