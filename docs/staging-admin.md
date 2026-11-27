# Staging Admin verification

The production service continues to use the existing `render.yaml`. The separate
`render.staging.yaml` defines only `salonbook-api-staging`. After approval and
publication of the `staging/admin-verification` Server branch, apply it as a new
Blueprint from that branch with the custom path `render.staging.yaml`. Review the
resource list before applying. It should contain one new staging service and no
production resource changes.

## Resource and cost review

| Provider | Proposed scope and resources | Estimated incremental base cost |
| --- | --- | --- |
| Render | New `SalonBook Staging` Hobby workspace. One Free Node web service named `salonbook-api-staging` in Singapore. Its own build and Free instance-hour allowance. No custom domain, persistent disk, or shared environment group. | USD 0/month within allowances |
| MongoDB Atlas | New `SalonBook Staging` project. One Atlas Core Free (M0) cluster named `salonbook-staging`, AWS Singapore (`ap-southeast-1`). Fresh `salonbook_staging` database. | USD 0/month |
| Vercel | Existing Client project and protected PR Preview. Branch-specific `SALONBOOK_API_URL` only for `completion/assignment-readiness`. One Preview redeployment. | USD 0 additional base cost within the existing plan |

Render Free compute can sleep, and the Preview still counts toward the existing
Vercel account's usage. The estimate assumes the above tiers and included usage.
If a dashboard offers a paid tier, the requested region is unavailable, or the
displayed estimated total is above USD 0, stop for a new review.

1. Create the separate Atlas project and dedicated staging cluster with a fresh
   `salonbook_staging` database. Use a distinct database login with `readWrite`
   confined to that database and restricted to the staging cluster. Do not copy
   production users, bookings, credentials, or auth sessions.
2. Configure the staging service with the independently verified staging Atlas
   hostname in `SALONBOOK_STAGING_MONGODB_HOST` and its password-authenticated
   SRV URI in `MONGODB_URI`. Use private deployment settings for the URI.
   Allowlist the required Render outbound ranges in the staging Atlas project.
   Keep the generated Better Auth secret separate. The Server refuses startup
   in staging if ImgBB credentials are set or TLS verification
   is disabled.
3. After the staging service reports `ready` at `/api/ready`, set
   `SALONBOOK_API_URL` for the Vercel **Preview** branch only, to the staging
   HTTPS API URL ending in `/api`. Redeploy the Preview. The blueprint pins
   CORS and Better Auth to the stable PR Preview alias, so use that alias.
4. Register a new staging-only test account. With the separately prepared
   one-time Atlas Admin CLI, an authorized operator can confirm that account's
   ID and email against the staging host and `salonbook_staging` using staging-only
   credentials. Use the CLI's guarded `bootstrap:admin:atlas` command after it is
   available in the operator checkout. Do not use the older email-only bootstrap
   from the existing deployment. Leave the one-time marker in place.
5. In the protected Preview, verify the test Admin gets `role: "admin"` from
   `/salon-api/auth/me`, opens `/admin`, and receives `200` from
   `/salon-api/admin/dashboard/stats`. A separate staging Customer must receive
   `403` from the Admin API, and a signed-out request must receive `401`.

The startup checks compare the URI with the staging database and the configured
staging hostname. Cluster isolation and scoped Atlas privileges are the controls
that prevent staging credentials from writing production data.

## Google sign-in

Create a Web application OAuth client for staging in Google Auth Platform.
Register the exact Preview callback as an authorized redirect URI:

`https://salonbook-client-git-completion-assignment-r-82c2f1-abir-hossan.vercel.app/api/better-auth/callback/google`

Use a Google test audience for staging. Add the client credentials together as
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the Render staging service.
Leave both unset to disable Google sign-in. In a browser with access to the
protected Preview, test Google sign-in with an authorized Gmail account, then
sign out and sign in again. The Google identity should return to the same
staging account with the customer role.

## Stripe Sandbox checkout

To enable Checkout, add both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to
the existing Render staging service in one update. Use a test secret or
restricted API key from the Stripe Sandbox and the signing secret for that
Sandbox's webhook destination at
`https://salonbook-api-staging.onrender.com/api/payments/webhook`. Subscribe to
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, and
`checkout.session.expired`. With both settings unset, online payments are disabled.

In the protected Preview, sign in as a staging Customer and pay for a confirmed,
unpaid test appointment using a Stripe test card. Verify the appointment becomes
paid after webhook delivery and the transaction appears in Admin Transactions.
