# CRM + Sales Management Platform

A modular, API-first CRM + Sales Management system for SMEs, built around the
full commercial lifecycle: **Lead → Qualification → Opportunity → Quotation →
Approval → Sales Order → Invoice → Payment**.

- Architecture & specification: [`docs/00-phase-0-architecture-and-spec.md`](docs/00-phase-0-architecture-and-spec.md)
- Current sprint: **01 — Foundation / Auth / Organization**

## Stack

| Layer | Tech |
|---|---|
| Monorepo | npm workspaces (`apps/api`, `apps/web`, `packages/shared`) |
| API | NestJS 10 · Prisma 5 · PostgreSQL 16 · Redis 7 (BullMQ later) |
| Web | Next.js 14 (App Router) · React 18 · Tailwind |
| Auth | JWT access + httpOnly refresh cookie · argon2 · RBAC |

## Prerequisites

- Node.js ≥ 20 (tested on 24)
- Docker (for Postgres + Redis)

## Setup

```bash
# 1. Environment
cp .env.example .env
cp .env.example apps/api/.env          # API reads apps/api/.env for Prisma + Nest
# For web, set NEXT_PUBLIC_API_URL (defaults to http://localhost:4000)

# 2. Install dependencies (root, all workspaces)
npm install

# 3. Start infrastructure
npm run db:up                          # Postgres :55432, Redis :6379

# 4. Build shared package (API/Web consume its compiled output)
npm run build --workspace @crm/shared

# 5. Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate                 # creates tables (name the migration e.g. "init")

# 6. Seed permissions, roles, org, and the super admin
npm run db:seed
```

Seed creates a super admin — default `admin@demo.test` / `Admin123!`
(override via `SEED_*` vars in `apps/api/.env`).

## Run (dev)

```bash
# terminal 1 — keep shared types compiling
npm run dev --workspace @crm/shared

# terminal 2 — API on http://localhost:4000/api
npm run dev:api

# terminal 3 — Web on http://localhost:3000
npm run dev:web
```

Open http://localhost:3000, sign in with the seeded super admin.

## Verify

```bash
curl http://localhost:4000/api/health          # { status: "ok", db: "up" }
```

- `POST /api/auth/login` → `{ accessToken, user }` (+ refresh cookie)
- `GET /api/auth/me` (Bearer) → current auth user
- `GET /api/organizations/current` → tenant org
- `GET /api/users` → requires `users.manage`
- `GET /api/roles` → requires `roles.manage`

## Layout

```
apps/
  api/   NestJS: auth, users, organizations, roles, health
         common/ context (tenant ALS), audit, rbac guard
         prisma/ schema + seed
  web/   Next.js: login, app shell, dashboard, users
packages/
  shared/  money utils · status/state-machines · permission matrix · event names
docs/    Phase 0 architecture & specification
```

## Conventions (enforced from Sprint 01)

- **Tenancy:** every business table has `organization_id`; services scope by the
  request tenant context (`requireOrgId()`).
- **Money:** integer minor units + currency code, never floats (`@crm/shared/money`).
- **State machines:** transitions validated against `@crm/shared/enums`.
- **RBAC:** `@RequirePermissions(...)` + `PermissionsGuard`; matrix in `@crm/shared/permissions`.
- **Audit:** meaningful mutations call `AuditService.record()`; append-only.
- **Events:** cross-module side effects via `EventEmitter2` + `@crm/shared/events`.
