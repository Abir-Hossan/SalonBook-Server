# Phase 02 endpoint inventory

| Method | Endpoint | Access | Phase 02 status |
|---|---|---|---|
| GET | `/api/health` | Public | Implemented |
| GET | `/api/services` | Public active; admin can request `includeInactive=true` | Implemented |
| GET | `/api/services/categories` | Public | Implemented |
| GET | `/api/services/:id` | Public active; admin can request `includeInactive=true` | Implemented |
| POST | `/api/services` | Admin | Route/service implemented; Phase 04 principal integration pending |
| PATCH | `/api/services/:id` | Admin | Route/service implemented; Phase 04 principal integration pending |
| DELETE | `/api/services/:id` | Admin | Route/service implemented; Phase 04 principal integration pending |
| POST | `/api/appointments` | Customer | Implemented; Phase 04 principal integration pending |
| GET | `/api/appointments/my` | Customer | Implemented; Phase 04 principal integration pending |
| GET | `/api/appointments/:id` | Owner/admin | Implemented; Phase 04 principal integration pending |
| PATCH | `/api/appointments/:id/cancel` | Customer owner | Implemented; Phase 04 principal integration pending |
| GET | `/api/admin/appointments` | Admin | Implemented; Phase 04 principal integration pending |
| PATCH | `/api/admin/appointments/:id/confirm` | Admin | Implemented; Phase 04 principal integration pending |
| PATCH | `/api/admin/appointments/:id/cancel` | Admin | Implemented; Phase 04 principal integration pending |
| PATCH | `/api/users/profile` | Authenticated user | Implemented; Phase 04 principal integration pending |
| GET | `/api/admin/users` | Admin | Implemented; Phase 04 principal integration pending |
| GET | `/api/admin/users/:id` | Admin | Implemented; Phase 04 principal integration pending |
| PATCH | `/api/admin/users/:id/block` | Admin | Implemented; Phase 04 principal integration pending |
| PATCH | `/api/admin/users/:id/unblock` | Admin | Implemented; Phase 04 principal integration pending |
| GET | `/api/transactions/my` | Customer | Implemented; Phase 04 principal integration pending |
| GET | `/api/transactions/:id` | Owner/admin | Implemented; Phase 04 principal integration pending |
| GET | `/api/admin/transactions` | Admin | Implemented; Phase 04 principal integration pending |
| GET | `/api/customer/dashboard/stats` | Customer | Implemented; Phase 04 principal integration pending |
| GET | `/api/admin/dashboard/stats` | Admin | Implemented; Phase 04 principal integration pending |

Not implemented by design: `/api/payments/create-checkout-session`, `/api/payments/webhook` (Phase 06). No API exists to manually set a transaction or appointment payment to paid.
