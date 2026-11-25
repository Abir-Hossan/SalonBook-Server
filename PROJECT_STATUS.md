# SalonBook project status

Updated 25 November 2026.

## Release status

**Implementation branches are available. Production acceptance remains open.** The current Vercel application renders its public pages, but the catalogue and categories are unavailable. Its `/salon-api/health` rewrite returned Vercel `404 DNS_HOSTNAME_RESOLVED_PRIVATE` in a browser. A public, healthy Express endpoint and the corresponding Vercel environment setting are required.

| Component | Location |
| --- | --- |
| Client | [SalonBook-Client](https://github.com/Abir-Hossan/SalonBook-Client) · [completion branch](https://github.com/Abir-Hossan/SalonBook-Client/tree/completion/assignment-readiness) |
| Server | [SalonBook-Server](https://github.com/Abir-Hossan/SalonBook-Server) · [completion branch](https://github.com/Abir-Hossan/SalonBook-Server/tree/completion/assignment-readiness) |
| Existing client deployment | [salonbook-client-ivory.vercel.app](https://salonbook-client-ivory.vercel.app/) |
| Server deployment | Public URL pending hosting and Atlas setup |

Next.js serves the public site and dashboards, using same-origin rewrites to the Express API. TypeScript domain modules enforce booking and account rules. Mongoose persists services, users, appointments and transactions. Better Auth manages browser cookies and signs five-minute API JWTs. A bearer JWT still requires a live, matching Better Auth session and an authorized, unblocked database account. Stripe Checkout remains in test mode. Audio, video, escrow, staff scheduling, and separate room capacity are outside the supplied requirements.

## Assignment checklist

| Requirement | Implementation and acceptance |
| --- | --- |
| Six active services and featured homepage | Home requests six active records. The explicit catalog bootstrap inserts the six supplied services without overwriting existing records. Verify six active records on the public homepage after staging setup. |
| Service listing, details, categories, search, sorting and filtering | Integrated with Express. Public catalogue uses server pagination, category filters, search and price sorting. The existing deployment cannot reach the API. |
| Customer and admin auth | Existing signup, signin, signout, blocking, roles, redirects and booking resume are preserved. Added remember-me renewal and session-bound JWT support. Live Google OAuth, production cookie flags and browser refresh remain acceptance items. |
| Appointment booking, conflicts and ownership | Availability comes from the server. The existing six start times, single shared salon capacity and future-date rule are retained. New records snapshot price, duration, name and image. A MongoDB unique multikey index protects concurrent overlap. Existing appointments are checked using their stored duration or the current service duration. Cancellation releases the reservation. Validate existing future rows and indexes on a disposable Atlas database before rollout. |
| Customer portal | Displays server-paginated appointments, status, details, cancellation, profile and payment history. Upcoming appointments exclude cancelled and earlier dates. |
| Admin portal | API-backed statistics, service CRUD and activation, appointment actions, customer blocking/unblocking, profiles, and paginated transaction history. Role enforcement stays on the server. |
| ImgBB | Service and profile upload routes retain file type, signature, size and auth checks. Forms persist the provider URL. Provider and proxy acceptance remain open. |
| Stripe and transactions | Checkout requires an owned, confirmed, unpaid booking. Signed test webhooks update the appointment and ledger transaction atomically. Duplicate event handling, closed sessions and definitive provider rejections are handled. A stale ambiguous attempt whose session ID was never saved still requires operator reconciliation in Stripe. Live charges are disabled. |
| UX and responsive QA | Existing layouts and design assets retained. Public homepage and catalogue were inspected on the existing Vercel build. Responsive and authenticated acceptance of the new build remains open. |
| Documentation and delivery | Both READMEs updated. Historical reports retained. OpenAPI describes the current readiness, availability and payment routes. |
| Separate repositories and Git history | The Client and Server remain independent. GitHub listed 2 Client and 5 Server commits on the starting main branches. The assignment requires 20 and 12 meaningful commits respectively. Count accepted history after merging genuine changes. Neither threshold should be reported as satisfied from the starting history or these branches alone. |

## Verification

- Browser inspection of the existing public homepage and catalogue reproduced the API failure. The same-origin health rewrite returned Vercel `404 DNS_HOSTNAME_RESOLVED_PRIVATE`.
- The local Node 24 execution parsed 50 server TypeScript files and exercised the real appointment service with in-memory repositories. It verified calendar timezone, slot validation, role and ownership rules, price and duration snapshots, overlapping and adjacent bookings, cancellation/rebooking and competing state transitions.
- npm package installation in this workspace was blocked by `ENOTFOUND registry.npmjs.org`. The historical reports record earlier passing checks; those runs do not verify the completion branches.
- Added regression coverage for overlapping bookings through MongoDB, JWT revocation on logout, and verified/duplicate Stripe test events. CI workflows set up a disposable loopback MongoDB replica set on the Server runner.
- Atlas TLS remains **unverified**. A dedicated authorized QA URI and hostname were unavailable. Current workspace credentials, external provider accounts and production MongoDB were outside the observed verification scope. Use an isolated QA deployment and leave TLS and certificate verification enabled.

## Deploy and verify the Server

1. Create or connect a Render Node Web Service to the Server repository and select the completion branch for staging. Use the supplied `render.yaml` Blueprint or the same settings in the service dashboard. The build command is `npm ci --include=dev && npm run build`. The start command is `npm start`, which runs `dist/server.js`. The health check is `/api/ready`. Render supplies `PORT`.
2. Set `NODE_ENV=production`, `MONGODB_URI`, `MONGODB_DB_NAME`, `BETTER_AUTH_SECRET` (at least 32 characters), `BETTER_AUTH_URL`, `CLIENT_URL`, and `ALLOWED_ORIGINS`. The URL settings must identify the public HTTPS Client origin. Set `SALON_TIME_ZONE` to the intended salon IANA timezone; it defaults to UTC. Configure `TRUST_PROXY` only after confirming the host's trusted proxy path.
3. Verify the Atlas database user and index permissions and allow the hosting service's egress addresses in Atlas. Check SRV lookup, the TLS handshake, and MongoDB authentication from the actual hosting environment. Use `SALONBOOK_ATLAS_TEST_URI`, `SALONBOOK_ATLAS_QA_HOST` and `SALONBOOK_ATLAS_QA_MODE=confirmed-disposable` for the isolated acceptance suite. The QA harness rejects the application database.
4. On the configured Server runtime, run `npm run seed:catalog` for the initial catalogue and verify the active count. Create the intended operator through normal registration. With that account's owner-authorized email configured as `SALONBOOK_BOOTSTRAP_ADMIN_EMAIL`, run `npm run bootstrap:admin` in a controlled Server environment. Remove the temporary setting after the role is confirmed.
5. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and the exact HTTPS Client callback `/api/better-auth/callback/google`. Add `IMGBB_API_KEY` for image uploads. Configure a Stripe test secret key and `STRIPE_WEBHOOK_SECRET`, then register the public Server `/api/payments/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`. Keep all values in the provider environment.

## Deploy and verify the Client

Set the Vercel project's `SALONBOOK_API_URL` to the actual public Express HTTPS URL ending in `/api`; redeploy the Client completion branch. The production build now rejects an absent or loopback API URL. Check Server readiness directly and through the Vercel rewrite before verifying the catalogue. Then run the end-to-end customer and admin journey on desktop, tablet and mobile, including a duplicate booking race and a Stripe test payment. Confirm dashboard records, image upload, Google callback, secure cookies, reload behavior and unauthorized access. Use production only after this staging run passes.

Official references: [Render Node web services](https://render.com/docs/web-services), [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/), [Vercel private DNS error](https://vercel.com/docs/errors/DNS_HOSTNAME_RESOLVED_PRIVATE), [Better Auth sessions](https://better-auth.com/docs/concepts/session-management), [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment).
