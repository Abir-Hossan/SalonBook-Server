# SalonBook REST API — Phase 02 contract

**Status:** Implemented as an Express/TypeScript API foundation with in-memory repositories. MongoDB, Better Auth/JWT, Stripe and ImgBB are intentionally not integrated in Phase 02.

Base URL: `http://localhost:5000/api`

## Response envelopes

Success: `{ "success": true, "message": "...", "data": {}, "meta": null }`.
Paginated success places the page object in `data` as an array and pagination in `meta`: `{ page, limit, total, totalPages }`.
Error: `{ "success": false, "message": "...", "errors": [{ "code": "..." }] }` or validation issue objects. Stack traces are never returned.

## Authentication boundary

Protected routes are mounted and explicitly marked as awaiting Phase 04. The default principal resolver returns HTTP 501 `AUTH_INTEGRATION_PENDING`; it does not accept user IDs from headers or request bodies. The app factory accepts an internal principal resolver for isolated tests only. This is dependency injection, not a client-controlled authentication mechanism. In production, replace it with verified Better Auth/JWT principal resolution in Phase 04.

Roles: `customer`, `admin`. Blocked principals receive 403. A customer cannot access admin routes. Public service reads expose active services only. `GET /services?includeInactive=true` requires admin.

## Common query parameters

List endpoints use `page` (integer >= 1, default 1) and `limit` (integer 1–100, default 12 or 20). Invalid query values return 400.

## Services

| Method | URL | Access | Purpose |
|---|---|---|---|
| GET | `/services` | Public | Active service catalogue; search/filter/sort/page |
| GET | `/services/categories` | Public | Distinct categories from active services |
| GET | `/services/:id` | Public | Active service detail |
| POST | `/services` | Admin (Phase 04 pending) | Create service |
| PATCH | `/services/:id` | Admin (Phase 04 pending) | Update service |
| DELETE | `/services/:id` | Admin (Phase 04 pending) | Delete only if no appointment history |

`GET /services` query: `q`, `category`, `minPrice`, `maxPrice`, `sort=price_asc|price_desc|newest`, `page`, `limit`, `includeInactive=true|false` (admin only when true).

Create/update body fields: `serviceName` (2–120 chars), `category` (2–60), `description` (10–2000), `price` (positive finite number), `duration` (integer 1–1440 minutes), `image` (URL), `status=active|inactive`. Unknown fields are rejected. ID format is 24 hexadecimal characters, matching the planned Mongo ObjectId contract.

Success: 200 for reads/updates, 201 for create, 204 for delete. Errors include 400 validation/ID, 401 unauthenticated, 403 forbidden, 404 missing/inactive, 409 historical appointment prevents delete, 501 auth integration pending.

## Appointments

| Method | URL | Access | Purpose |
|---|---|---|---|
| POST | `/appointments` | Customer (Phase 04 pending) | Create pending/unpaid appointment |
| GET | `/appointments/my` | Customer (Phase 04 pending) | Current customer's appointments |
| GET | `/appointments/:id` | Owner or admin (Phase 04 pending) | Detail |
| PATCH | `/appointments/:id/cancel` | Owner, pending only (Phase 04 pending) | Customer cancellation |
| GET | `/admin/appointments` | Admin (Phase 04 pending) | List all appointments |
| PATCH | `/admin/appointments/:id/confirm` | Admin (Phase 04 pending) | Confirm pending appointment |
| PATCH | `/admin/appointments/:id/cancel` | Admin (Phase 04 pending) | Cancel pending or confirmed appointment |

Create body: `serviceId` (24-char hex), `appointmentDate` (`YYYY-MM-DD`, valid future calendar date), `timeSlot` (`h:mm AM|PM`), optional `message` (max 500 chars). Client-supplied `customerId`, price, status and payment status are rejected. Customer identity is derived only from verified principal context. Price is copied from the active service repository record.

List query: `status=pending|confirmed|cancelled`, `paymentStatus=unpaid|paid`, `dateFrom`, `dateTo`, `page`, `limit`.

Business rules: new appointments are pending/unpaid; active service required; duplicate active global salon date/time slots conflict; cancellation makes the slot available again; customer cancels own pending appointments only; admin confirms pending only and cancels pending/confirmed; checkout eligibility helper permits confirmed + unpaid only. Appointment repository exposes a slot lookup contract. In-memory implementation is process-local and not atomic across multiple server processes; Phase 03 must enforce uniqueness atomically in MongoDB.

## Users

| Method | URL | Access | Purpose |
|---|---|---|---|
| PATCH | `/users/profile` | Authenticated user (Phase 04 pending) | Update own name/image only |
| GET | `/admin/users` | Admin (Phase 04 pending) | List users |
| GET | `/admin/users/:id` | Admin (Phase 04 pending) | User detail |
| PATCH | `/admin/users/:id/block` | Admin (Phase 04 pending) | Block customer |
| PATCH | `/admin/users/:id/unblock` | Admin (Phase 04 pending) | Unblock customer |

Profile body accepts only `name` (2–80 chars) and/or `image` (URL). `role`, `isBlocked`, email, and arbitrary properties are rejected. Admin list query: `q`, `role`, `isBlocked=true|false`, `page`, `limit`. Admin accounts cannot be blocked through the customer block endpoint.

## Transactions

| Method | URL | Access | Purpose |
|---|---|---|---|
| GET | `/transactions/my` | Customer (Phase 04 pending) | Own transaction history |
| GET | `/transactions/:id` | Owner or admin (Phase 04 pending) | Transaction detail |
| GET | `/admin/transactions` | Admin (Phase 04 pending) | All transactions |

Query: `status=paid|failed`, `appointmentId`, `page`, `limit`. There is deliberately no endpoint to create a transaction or set a transaction/payment to paid. Stripe Checkout and webhook processing are Phase 06.

## Dashboard support endpoints

| Method | URL | Access | Purpose |
|---|---|---|---|
| GET | `/customer/dashboard/stats` | Customer (Phase 04 pending) | Current user's appointment counts |
| GET | `/admin/dashboard/stats` | Admin (Phase 04 pending) | Platform counts |

## Health and errors

`GET /health` returns status, application name, environment and timestamp. It is outside the `/api` rate limiter. API rate limit is 300 requests per 15 minutes per client IP by default; response is 429. Request body size is configurable (`REQUEST_BODY_LIMIT`, default 100kb). Request ID is returned in `X-Request-Id`.

HTTP statuses used: 200, 201, 204, 400, 401, 403, 404, 409, 413, 422, 429, 501, 500. Unknown routes return 404.

## OpenAPI

See `openapi.yaml` for the machine-readable endpoint summary. Detailed validation rules and lifecycle constraints in this document remain authoritative.

## Known Phase 02 limitations

- Memory repositories are volatile and reset on restart; they are test/demo adapters, not persistent storage.
- No database integration or cross-process slot locking. MongoDB/atomic uniqueness is Phase 03.
- Authentication is not faked; protected routes return 501 until Phase 04 injects a verified principal resolver.
- Transaction records are read-only in this phase; payment state can only be changed by a future verified Stripe webhook.
- Currency is currently a stored transaction field in the interface; no business currency is assumed or payment operation implemented.
- Appointment slot scope is provisionally global per salon date/time because no staff/location scheduling model is approved.
