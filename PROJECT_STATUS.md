# SalonBook project status

Updated 25 November 2026.

## Release status

**Implementation and automated staging checks are complete. Provider and production acceptance remain open.** The current Vercel application renders its public pages, but the catalogue and categories are unavailable. Its `/salon-api/health` rewrite returned Vercel `404 DNS_HOSTNAME_RESOLVED_PRIVATE` in a browser. A public, healthy Express endpoint and the corresponding Vercel environment setting are required.

| Component | Location |
| --- | --- |
| Client | [SalonBook-Client](https://github.com/Abir-Hossan/SalonBook-Client) · [completion branch](https://github.com/Abir-Hossan/SalonBook-Client/tree/completion/assignment-readiness) |
| Server | [SalonBook-Server](https://github.com/Abir-Hossan/SalonBook-Server) · [completion branch](https://github.com/Abir-Hossan/SalonBook-Server/tree/completion/assignment-readiness) |
| Existing client deployment | [salonbook-client-ivory.vercel.app](https://salonbook-client-ivory.vercel.app/) |
| Server deployment | Public URL pending hosting and Atlas setup |

Next.js serves the public site and dashboards, using same-origin rewrites to the Express API. TypeScript domain modules enforce booking and account rules. Mongoose persists services, users, appointments and transactions. Better Auth manages browser cookies and signs five-minute API JWTs. A bearer JWT still requires a live, matching Better Auth session and an authorized, unblocked database account. Stripe Checkout remains in test mode.

## Assignment checklist

| Requirement | Implementation and acceptance |
| --- | --- |
| Six active services and featured homepage | Home requests six active records. The explicit catalog bootstrap inserts the six supplied services without overwriting existing records. Verify six active records on the public homepage after staging setup. |
| Service listing, details, categories, search, sorting and filtering | Integrated with Express. Public catalogue uses server pagination, category filters, search and price sorting. The existing deployment cannot reach the API. |
| Customer and admin auth | Existing signup, signin, signout, blocking, roles, redirects and booking resume are preserved. Added remember-me renewal and session-bound JWT support. The CI suite verifies cookie flags under HTTPS configuration and session renewal. Live Google OAuth and the deployed Vercel cookie path remain acceptance items. Password recovery and email verification require mail delivery configuration. |
| Appointment booking, conflicts and ownership | Availability comes from the server. The existing six start times, single shared salon capacity and future-date rule are retained. New records snapshot price, duration, name and image. A MongoDB unique multikey index protects concurrent overlap. Existing appointments are checked using their stored duration or the current service duration. Cancellation releases the reservation. Validate existing future rows and indexes on a disposable Atlas database before rollout. |
| Customer portal | Displays server-paginated appointments, status, details, cancellation, profile and payment history. Upcoming appointments exclude cancelled and earlier dates. |
| Admin portal | API-backed statistics, service CRUD and activation, appointment actions, customer blocking/unblocking, profiles, and paginated transaction history. Role enforcement stays on the server. |
| ImgBB | Service and profile upload routes retain file type, signature, size and auth checks. Forms persist the provider URL. Provider and proxy acceptance remain open. |
| Stripe and transactions | Checkout requires an owned, confirmed, unpaid booking. Signed test webhooks update the appointment and ledger transaction atomically. Duplicate event handling, closed sessions and definitive provider rejections are handled. Admins can release a recorded unpaid checkout after Stripe confirms its expiry. A stale ambiguous attempt whose session ID was never saved still requires operator reconciliation in Stripe. Live charges are disabled. |
| UX and responsive QA | Existing layouts and design assets retained. Public homepage and catalogue were inspected on the existing Vercel build. Chromium verified public and auth layout widths at 390, 768 and 1440 pixels and exercised booking, account and admin flows against disposable MongoDB. Deployed HTTPS browser acceptance remains open. |
| Documentation and delivery | Both READMEs updated. Historical reports retained. OpenAPI describes the current readiness, availability and payment routes. |
| Separate repositories and Git history | The Client and Server remain independent. GitHub listed 2 Client and 5 Server commits on the starting main branches. The assignment requires 20 Client and 12 Server commits. These draft branches add 11 Client and 10 Server commits, giving 13 Client and 15 Server commits if the branches are merged with history preserved. The Client threshold is still short by seven commits. Verify the submitted default-branch history before grading. |

## Verification

- Browser inspection of the existing public homepage and catalogue reproduced the API failure. The same-origin health rewrite returned Vercel `404 DNS_HOSTNAME_RESOLVED_PRIVATE`.
- [Server CI](https://github.com/Abir-Hossan/SalonBook-Server/actions/runs/45566328333) passed dependency installation, TypeScript, ESLint, production build and **102 tests across 10 suites** on a disposable MongoDB replica set. It exercised HTTPS cookie flags, session refresh, signed JWT and logout, mocked Google OAuth and ImgBB, Stripe test events and admin release, database persistence and concurrent booking.
- [Client CI](https://github.com/Abir-Hossan/SalonBook-Client/actions/runs/45566860531) passed dependency installation, TypeScript, ESLint, production build and the browser journey. Chromium verified six services, catalogue search and recovery from a simulated network failure, registration, booking resume after reload, appointment confirmation and cancellation, profile persistence, payment history, role protection, sign-out, and three viewport widths. The browser ran the real Client and Server against a disposable database.
- The local Node 24 execution parsed 50 server TypeScript files and exercised the real appointment service with in-memory repositories. It verified calendar timezone, slot validation, role and ownership rules, price and duration snapshots, overlapping and adjacent bookings, cancellation/rebooking and competing state transitions.
- The local client configuration check rejected missing and loopback production targets and generated the expected HTTPS API and Better Auth rewrites.
- npm package installation in this workspace was blocked by `ENOTFOUND registry.npmjs.org`. The historical reports record earlier passing checks; those runs do not verify the completion branches.
- Atlas TLS remains **unverified**. A dedicated authorized QA URI and hostname were unavailable. Current workspace credentials, external provider accounts and production MongoDB were outside the observed verification scope. Use an isolated QA deployment and leave TLS and certificate verification enabled.

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

Set the Vercel project's `SALONBOOK_API_URL` to the actual public Express HTTPS URL ending in `/api` and redeploy the Client completion branch to its staging origin. The production build now rejects an absent or loopback API URL. Check Server readiness directly and through the Vercel rewrite before verifying the catalogue. Then run the end-to-end customer and admin journey on desktop, tablet and mobile, including a duplicate booking race and a Stripe test payment. Confirm dashboard records, image upload, Google callback, secure cookies, reload behavior and unauthorized access. Use production only after this staging run passes.

Official references: [Render Node web services](https://render.com/docs/web-services), [Render shell access](https://render.com/docs/ssh), [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/), [Vercel private DNS error](https://vercel.com/docs/errors/DNS_HOSTNAME_RESOLVED_PRIVATE), [Better Auth sessions](https://better-auth.com/docs/concepts/session-management), [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment).
