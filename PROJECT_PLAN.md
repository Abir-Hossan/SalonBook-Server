# SalonBook Server — Phase 02 implementation plan

This document carries forward the approved Phase 00 architecture and scopes this repository to Phase 02 only.

## Architecture

- Node.js + Express 4 + TypeScript.
- Modular feature boundaries: services, appointments, users, transactions, dashboard.
- HTTP controllers are thin route handlers; domain rules live in service classes.
- Repository interfaces isolate persistence; current memory adapters exist only for local demonstration and tests.
- Zod validates body, params and query inputs.
- Helmet, allowlisted CORS, request-size limits, request IDs, Pino structured logging, rate limiting and centralized safe errors form the security foundation.
- Verified principal resolution is an injected interface. Default behavior is explicit HTTP 501 until Phase 04; no headers/body are trusted as identity.

## Business invariants

- Four business collections only: Users, Services, Appointments, Transactions.
- Appointment starts pending/unpaid; only active service can be booked; price is copied from service data, never client input.
- Customer can cancel own pending only; admin confirms pending and cancels pending/confirmed.
- Cancelled slots are considered released.
- Only confirmed/unpaid appointments pass the checkout eligibility service guard.
- No manual transaction/payment success mutation route exists.

## Phase boundaries

Phase 03 MongoDB/Mongoose, Phase 04 Better Auth/JWT, Phase 05 complete feature integration, Phase 06 Stripe/ImgBB, Phase 07 frontend API integration and deployment are excluded.

## Repository status at inspection

The supplied Phase 00 progress report says the remote Server repository was empty. `git ls-remote` could not be rechecked in this execution because `github.com` DNS lookup failed. No local server source directory existed. This repository is therefore initialized as a new local working tree; no remote repository was modified.
