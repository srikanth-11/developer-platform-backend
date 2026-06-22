# Backend Build Notes

A running log of **what** we built, **why**, and the **technology/reasoning** behind each step.
Read top-to-bottom to understand how the platform was assembled.

---

## Step 1 — Project Foundation

**Goal:** A booting NestJS app that loads validated config, connects to PostgreSQL,
and exposes a health endpoint — with Postgres + Redis running in Docker.

### What we did

1. **Created the project layout**
   - `developer-platform/` (root) → `backend/` (NestJS) and later `frontend/`.
   - Infra (`docker-compose.yml`) lives at the root because it serves the whole project.

2. **Scaffolded NestJS 11** with the Nest CLI (`nest new backend`, npm, `--strict`).

3. **Installed foundation dependencies**
   | Package | Why |
   |---|---|
   | `@nestjs/config` | Loads env vars into a typed, injectable config service |
   | `@nestjs/typeorm` + `typeorm` + `pg` | ORM + PostgreSQL driver |
   | `@nestjs/terminus` | Standard health-check endpoint |
   | `joi` | Validates environment variables at startup (fail fast) |
   | `class-validator` + `class-transformer` | Validate/transform incoming request DTOs |

4. **Folder structure** (`src/`)
   - `config/` — `configuration.ts` (typed config factory) + `env.validation.ts` (Joi schema)
   - `database/` — `database.module.ts` (TypeORM async connection)
   - `health/` — health controller + module
   - `common/` — shared `decorators / guards / filters / interceptors / dto` (empty for now)

5. **Wired the app**
   - `app.module.ts` registers `ConfigModule` (global), `DatabaseModule`, `HealthModule`.
   - `main.ts` adds: global route prefix (`/api`), a global `ValidationPipe`
     (`whitelist`, `forbidNonWhitelisted`, `transform`), CORS, and config-driven port.

6. **Infrastructure** — `docker-compose.yml` runs Postgres 16 + Redis 7 with health checks
   and named volumes (data survives restarts).

7. **Environment files** — `.env` (real local values, git-ignored) + `.env.example`
   (committed template) + a proper `.gitignore`.

### Why these choices

- **Config + Joi validation:** Centralizing env access and validating at boot means a
  missing/bad variable fails immediately with a clear message, instead of a confusing
  crash later inside a DB call.
- **`forRootAsync` for TypeORM:** the DB credentials come from config (loaded async), so
  the connection must be built asynchronously with `ConfigService` injected.
- **`autoLoadEntities: true`:** each future feature module registers its own entities via
  `TypeOrmModule.forFeature([...])`; no central entity list to maintain.
- **`synchronize: true` (dev only):** auto-creates tables from entities for fast iteration.
  It can DROP columns, so it's strictly a dev/learning convenience — we'll switch to real
  migrations before any production concern.
- **Global `ValidationPipe`:** every request body is validated against its DTO and stripped
  of unknown fields — security (no over-posting) and correctness for free.
- **Health endpoint:** gives load balancers / Docker / monitors a single "am I alive and can
  I reach my dependencies?" probe. Returns `{ status: "ok", info: { database: { status: "up" }}}`.

### Problems hit & how we solved them (real-world debugging)

These are worth remembering — they're exactly the kind of environment issues you meet on real machines.

1. **`ReferenceError: crypto is not defined`** at startup.
   - Cause: `@nestjs/typeorm` v11 calls the global `crypto.randomUUID()`. Node made `crypto`
     a global in v19/20, but **this machine runs Node 18**, where it isn't global.
   - Fix: `src/polyfills.ts` assigns `globalThis.crypto = require('node:crypto').webcrypto`,
     imported as the **first line** of `main.ts` (before any module needing it loads).
   - Long-term: upgrading to Node 20+ makes this a harmless no-op.

2. **Postgres password auth failed even though our container was correct.**
   - Cause: a **native Windows PostgreSQL** was already listening on **both 5432 and 5433**,
     shadowing Docker's published ports. `localhost:5433` routed to the native Postgres
     (different password), not our container.
   - Fix: mapped our container to a clearly-free high host port — **55432**.

3. **Redis port 6379 taken** by another local Redis → mapped to **56379**.

4. **App port 3000 (and 3001) taken** by other local apps → backend runs on **3333**.

### Final local ports on THIS machine

| Service | Host port | In-container |
|---|---|---|
| Backend (NestJS) | **3333** | — |
| PostgreSQL | **55432** | 5432 |
| Redis | **56379** | 6379 |

> On a clean machine you could use the conventional 3000/5432/6379 — these overrides are
> only to avoid collisions with software already installed here. All of them live in `.env`,
> so nothing in the code is hard-coded.

### How to run

```bash
# 1. From developer-platform/ — start infra
docker compose up -d

# 2. From developer-platform/backend/ — install (first time) and run
npm install
npm run start:dev        # hot-reload dev mode

# 3. Verify
curl http://localhost:3333/api/health
# -> {"status":"ok","info":{"database":{"status":"up"}},...}
```

### Verified ✅
- `npm run build` compiles with zero errors.
- App boots, connects to Postgres, `GET /api/health` returns `status: ok`, `database: up`.

### Tech recap
**NestJS 11** (modular Node framework, DI + decorators), **TypeScript (strict)**,
**TypeORM 0.3** (decorator-based ORM), **PostgreSQL 16**, **Redis 7** (running, wired up in
Phase 3), **Docker Compose** (local infra), **Joi** (env validation), **Terminus** (health).

---

## Step 2 — User Management + Authentication

**Goal:** Users can register and log in; the platform issues JWTs and protects
routes. Passwords are stored only as bcrypt hashes.

### What we did

1. **Installed auth deps**
   | Package | Why |
   |---|---|
   | `@nestjs/jwt` | Sign & verify JWT access tokens |
   | `@nestjs/passport` + `passport` + `passport-jwt` | Strategy framework for auth; `passport-jwt` reads/validates Bearer tokens |
   | `bcryptjs` | Password hashing — **pure JS** (chosen over native `bcrypt` to avoid Windows node-gyp pain) |

2. **Config** — added a `jwt` section (`JWT_SECRET`, `JWT_EXPIRES_IN`) to
   `configuration.ts`, `.env`, `.env.example`, and Joi validation (`secret.min(16).required()`).

3. **`common/entities/base.entity.ts`** — `AbstractBaseEntity` with a **UUID PK** +
   `createdAt`/`updatedAt`. Every table extends this (no repeated boilerplate).
   - *Why UUIDs?* Non-guessable, safe to expose in URLs, no cross-tenant ID collisions —
     important for a multi-tenant API platform.

4. **User entity** (`users` table) — `email` (unique, indexed), `passwordHash`
   (`select: false`), `firstName`, `lastName`, `isActive`.
   - *Roles are intentionally NOT here.* Owner/Admin/Developer/Viewer are
     **per-organization** (a user can be Owner of one org, Viewer of another), so they'll
     live on `organization_members` in Step 3/4. This entity is pure identity.

5. **UsersModule / UsersService** — all DB access for users (`create`, `findById`,
   `findByEmail`, `findByEmailWithPassword`). Exported so AuthModule can use it.

6. **AuthModule**
   - `dto/` — `RegisterDto` (email + 8–72 char password + optional names) and `LoginDto`,
     validated automatically by the global ValidationPipe.
   - `strategies/jwt.strategy.ts` — extracts `Bearer` token, verifies signature, re-loads the
     user from DB (so tokens for deleted/deactivated users are rejected), attaches to `request.user`.
   - `guards/jwt-auth.guard.ts` — `@UseGuards(JwtAuthGuard)` protects routes.
   - `auth.service.ts` — `register` (hash + create + issue token) and `login` (verify + issue token).
   - `auth.controller.ts` — `POST /auth/register`, `POST /auth/login`, `GET /auth/me` (protected).

7. **`common/decorators/current-user.decorator.ts`** — `@CurrentUser()` pulls the
   authenticated user off the request in controllers.

### Why these choices (security reasoning)

- **bcrypt with cost factor 12** — bcrypt is deliberately *slow* and *salted*, which makes
  password brute-forcing expensive. Cost 12 ≈ a good balance of security vs. login latency.
- **`passwordHash` is `select: false`** — the hash is excluded from queries by default, so it
  can't leak through a stray `findOne`. Login explicitly re-selects it via a query builder.
  Responses are additionally sanitized to strip the hash.
- **Same "Invalid credentials" error** for unknown email *and* wrong password — prevents
  **user enumeration** (an attacker can't probe which emails are registered).
- **JWT re-validates the user in the DB** on every request — stateless tokens, but a
  deactivated account is locked out immediately rather than waiting for token expiry.
- **8–72 char password rule** — 8 is a sane minimum; 72 is bcrypt's hard byte limit (longer
  input is silently truncated), so we reject it up front to avoid a confusing footgun.

### Problem hit & fix

- **TS2322 on `expiresIn`** — `jsonwebtoken`'s types expect `number | template-literal`, but
  config gives a plain `string`. Fixed with a precise assertion:
  `as JwtSignOptions['expiresIn']` (honest, no `any`).

### API summary

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | Create account, return `{ accessToken, user }` |
| POST | `/api/auth/login` | public | Verify credentials, return `{ accessToken, user }` |
| GET | `/api/auth/me` | Bearer | Return the current user |

### Verified ✅ (all tested live)
- Register → 201 with token; response has **no** `passwordHash`.
- Duplicate email → 409. Weak password → 400 with message.
- Login correct → token; wrong password → 401; `/me` without token → 401; with token → 200 + user.
- DB check: password stored as `$2b$12$...` bcrypt hash, never plaintext.

### Tech recap
**JWT** (stateless auth tokens), **Passport** (`passport-jwt` strategy), **bcryptjs**
(salted password hashing), **class-validator** DTOs, TypeORM entity with a shared
`AbstractBaseEntity` base class.

---

## Step 3 — Organizations + Membership (Multi-Tenancy Foundation)

**Goal:** Users can create organizations, belong to many of them with a role, and
invite other registered users. Org data is isolated — no cross-tenant access.

### What we did

1. **`common/enums/role.enum.ts`** — the shared `Role` enum (OWNER / ADMIN / DEVELOPER /
   VIEWER). Roles are **per-organization**, stored on the membership row, not on the user.

2. **Organization entity** (`organizations` table) — `name`, unique `slug`, and a
   `OneToMany` to its members. This is the **tenant boundary**: every future resource
   (apps, keys, logs…) hangs off an organization.

3. **OrganizationMember entity** (`organization_members` table) — the JOIN table linking
   `user` ↔ `organization` and carrying the `role`. `@Unique(['organizationId','userId'])`
   means a user appears at most once per org. `user` is eager-loaded; both FKs cascade on delete.

4. **OrganizationsService** — the tenancy brain:
   - `create()` makes the org **and** the OWNER membership in **one transaction** (an org
     can never exist without an owner).
   - `findMyOrganizations()` — orgs the user belongs to, with their role in each.
   - `findOneForUser()` / `listMembers()` — gated by `getMembershipOrThrow()`.
   - `addMember()` — owner/admin only; forbids granting OWNER; requires the invitee to
     already have an account.
   - `getMembershipOrThrow()` — **the reusable multi-tenant gate** (no membership → 403).
   - `generateUniqueSlug()` — "Acme Corp" → `acme-corp`, then `acme-corp-2`, …

5. **DTOs** — `CreateOrganizationDto` (name 2–100), `InviteMemberDto` (email + `@IsEnum(Role)`).

6. **OrganizationsController** — `JwtAuthGuard` at the class level; uses `ParseUUIDPipe` so a
   malformed `:id` is rejected with 400 before hitting the service.

### Why these choices

- **Roles on the join table, not the user** — multi-tenancy means the same person can be
  OWNER of org A and VIEWER of org B. Putting the role on `organization_members` is the only
  correct place for it.
- **Transaction on create** — two writes (org + owner membership) must both succeed or both
  fail; otherwise a crash mid-way could leave an ownerless org. This teaches DB atomicity.
- **403 vs 404 for non-members** — we return **403 Forbidden** (authenticated but not allowed),
  which is the honest status. (A stricter design returns 404 to hide existence; we chose
  clarity for learning.)
- **`getMembershipOrThrow` is centralized** — every tenant-scoped action funnels through one
  check, so isolation can't be accidentally forgotten on a new endpoint. Step 4 promotes this
  into reusable **guards + decorators**.
- **Invite = add existing user (for now)** — real email invites for people without an account
  need the notification system (a later phase); we return a clear 404 until then.

### API summary

| Method | Route | Who | Purpose |
|---|---|---|---|
| POST | `/api/organizations` | any user | Create org (creator → OWNER) |
| GET | `/api/organizations` | any user | List my orgs + my role in each |
| GET | `/api/organizations/:id` | member | Get one org |
| GET | `/api/organizations/:id/members` | member | List members |
| POST | `/api/organizations/:id/members` | owner/admin | Add a registered user with a role |

### Verified ✅ (full live scenario with two users)
- Alice creates "Acme Corp" → she's OWNER; it shows in her org list, **empty** for Bob.
- **Isolation:** Bob reading Alice's org → **403**.
- Bob (non-member) adding a member → 403; Alice assigning OWNER → 403.
- Alice adds Bob as developer → success; Bob now sees the org (role developer) and can read it.
- Unknown email → 404; duplicate add → 409.
- Member list shows alice=owner, bob=developer (no password hashes leaked).
- Slug dedup: second "Acme Corp" → `acme-corp-2`. Tables `users`, `organizations`,
  `organization_members` all created.

### Tech recap
TypeORM **relations** (`@OneToMany`/`@ManyToOne`/`@JoinColumn`), **composite unique constraint**,
**enum column**, **DB transactions** (`manager.transaction`), `ParseUUIDPipe`, and a
centralized membership check as the multi-tenant boundary.

---

## Step 4 — RBAC (Roles, Guards, Decorators)

**Goal:** Replace hand-written `if (role !== ...)` checks inside the service with a
declarative, reusable system: put `@Roles(Role.ADMIN)` on an endpoint and a guard
enforces it automatically — with **role hierarchy**.

### What we did

1. **Role hierarchy** — added `ROLE_RANK` to `role.enum.ts`
   (`viewer=0 < developer=1 < admin=2 < owner=3`). This makes roles *comparable*, so a
   guard can ask "is the user's rank ≥ what the route requires?".

2. **`@Roles(...)` decorator** (`common/decorators/roles.decorator.ts`) — attaches the
   required **minimum** role(s) as route metadata. Hierarchical: `@Roles(Role.ADMIN)` admits
   ADMIN *and* OWNER; `@Roles(Role.OWNER)` = owner only.

3. **`OrgRolesGuard`** (`organizations/guards/org-roles.guard.ts`) — the centerpiece:
   - reads required roles via `Reflector`; if none, allows the route through;
   - extracts the org id from the request (`organizationId`/`orgId`/`id` param, or body);
   - validates it's a UUID, loads the user's membership (403 if not a member);
   - compares ranks (403 if too low);
   - **attaches `request.membership`** so handlers can reuse the role without re-querying.

4. **`@CurrentMembership()` decorator** — reads the membership the guard already loaded.

5. **Refactor** — `OrganizationsController` now declares auth with one `@Roles(...)` line per
   route; `OrganizationsService` lost its inline authorization (`findOne`/`listMembers`/
   `addMember` are slimmer). The service keeps only *business* rules (can't assign OWNER,
   invitee must exist, no duplicates). `getMembershipOrThrow` is now consumed by the guard.

### Why these choices

- **Declarative > imperative auth** — `@Roles(Role.ADMIN)` next to the route is self-documenting
  and impossible to forget halfway through a service method. The guard guarantees uniform
  enforcement across every gated route.
- **Hierarchy via ranks** — avoids listing every higher role on every endpoint. "Minimum role
  X" is the natural mental model and `@Roles(Role.OWNER)` still works as "owner only".
- **Guard attaches the membership** — one DB lookup serves both the auth check and any handler
  that needs the caller's role. No double queries.
- **Separation of concerns** — Guard = *authorization*; Service = *business logic*. Clean,
  testable, reusable (the guard + service are exported for the Applications module later).

### Bug found & fixed (important ordering lesson)

- **Malformed `:id` returned 500 instead of 400.**
  - Root cause: **NestJS runs guards BEFORE param pipes.** So `OrgRolesGuard` queried Postgres
    with the raw string `"not-a-uuid"` *before* `ParseUUIDPipe` could reject it → Postgres
    error "invalid input syntax for type uuid" → 500.
  - Fix: the guard validates the id with `isUUID()` and throws `400 BadRequestException` before
    touching the database. (Lesson: a guard can't rely on a param pipe that runs after it.)

### Authorization matrix (verified live)

Route `POST /organizations/:id/members` requires `@Roles(Role.ADMIN)`:

| Caller role | Read members (`@Roles VIEWER`) | Add member (`@Roles ADMIN`) |
|---|---|---|
| VIEWER (carol) | ✅ 200 | ❌ 403 |
| DEVELOPER (bob) | ✅ 200 | ❌ 403 |
| ADMIN (dave) | ✅ 200 | ✅ 201 |
| OWNER (alice) | ✅ 200 | ✅ (201/409 dup) |
| non-member (eve) | ❌ 403 | ❌ 403 |
| no token | ❌ 401 | ❌ 401 |

Plus: malformed UUID → 400, "cannot assign OWNER" business rule → 403.

### Tech recap
NestJS **custom guard** (`CanActivate`), **`Reflector`** + **`SetMetadata`** for route metadata,
**param decorators**, role-rank hierarchy, and the guard-vs-pipe execution-order gotcha.

---

## Step 5 — Applications

**Goal:** Organizations can register applications ("Mobile App", "Partner Integration").
Each app belongs to one org and will receive API credentials in Step 6.

### What we did

1. **Application entity** (`applications` table) — `name`, optional `description`,
   `organizationId` (indexed FK, CASCADE on org delete), `isActive`.

2. **DTOs** — `CreateApplicationDto` (name 2–100, optional description) and a hand-written
   `UpdateApplicationDto` (all fields optional → true PATCH semantics).

3. **ApplicationsService** — `create`, `findAllForOrg`, `findOneOrThrow`, `update`, `remove`.

4. **ApplicationsController** — routes **nested** under the org:
   `/organizations/:orgId/applications`. Reuses `JwtAuthGuard` + `OrgRolesGuard`.

5. **ApplicationsModule** — imports `OrganizationsModule` to borrow `OrgRolesGuard`; exports
   `ApplicationsService` for the upcoming ApiKey module.

### Why these choices

- **Nested routes** (`/organizations/:orgId/applications`) — the URL expresses ownership, and
  `OrgRolesGuard` picks up `:orgId` automatically. The new module needed **zero** changes to
  the guard — proof that Step 4's RBAC is genuinely reusable.
- **Tenant scoping at the data layer** — `findOneOrThrow` filters by BOTH `id` AND
  `organizationId`. The guard proves you're in org A; this query proves the *app* is in org A
  too. Without it, a member of org A could read an app from org B by guessing its UUID. This
  is the single most important multi-tenant safety habit.
- **Role policy** (from the spec): VIEWER reads, DEVELOPER creates/updates, ADMIN deletes
  ("manage APIs"). Declared per-route with one `@Roles(...)` line each.
- **`isActive` instead of always deleting** — lets an app be disabled (and its keys later
  rejected) while preserving history; hard delete is reserved for ADMIN.

### Role policy (verified live)

| Action | Route | Min role | viewer | developer | admin |
|---|---|---|---|---|---|
| List / read | GET | VIEWER | ✅ | ✅ | ✅ |
| Create | POST | DEVELOPER | ❌ 403 | ✅ | ✅ |
| Update | PATCH | DEVELOPER | ❌ 403 | ✅ | ✅ |
| Delete | DELETE | ADMIN | ❌ 403 | ❌ 403 | ✅ |

### Verified ✅
- Create 2 apps in Acme; list returns 2. PATCH toggles `isActive`/description (developer).
- **Tenant scoping:** reading Acme's app through the RBAC-Test org path → **404**.
- RBAC: viewer create/delete → 403; developer create/update → ok; developer delete → 403;
  admin delete → 200 `{deleted:true}`.

### Tech recap
TypeORM `@ManyToOne` FK with index + CASCADE, **nested REST resources**, partial-update PATCH,
**defense-in-depth tenant scoping** (guard + data-layer filter), and cross-module guard reuse.

---

## Step 6 — API Key Management

**Goal:** Applications get API credentials. Generate keys, show the secret ONCE, store only
hashes, and support revoke / rotate / expire / usage tracking.

### What we did

1. **ApiKey entity** (`api_keys` table) — `name`, `prefix`, `last4`, **`keyHash`** (unique,
   indexed), `applicationId` (FK), denormalized `organizationId`, `expiresAt`, `revokedAt`,
   `lastUsedAt`, `usageCount`.

2. **Key format** — `dk_<env>_<43 random url-safe chars>` from `crypto.randomBytes(32)`.
   `env` = live/test based on NODE_ENV. We store `prefix` (`dk_test`) + `last4` for display.

3. **ApiKeysService**
   - `create` — validates the app belongs to the org, generates a key, stores its hash,
     returns the **plaintext once** + masked metadata.
   - `findAllForApp` / `findOne` — masked views only (`dk_test_••••••••p54M`).
   - `revoke` — soft (sets `revokedAt`; kept for history). Double-revoke → 400.
   - `rotate` — revoke old + issue new (same name/expiry) in one transaction; returns the new
     plaintext and `rotatedFrom`.
   - `findValidByPlaintext` + `recordUsage` — used by the Step 7 gateway guard.

4. **ApiKeysController** — deeply nested route
   `/organizations/:orgId/applications/:appId/api-keys`. DEVELOPER+ creates/revokes/rotates;
   VIEWER+ lists. Reuses `JwtAuthGuard` + `OrgRolesGuard`.

### Why these choices (the security lessons)

- **Store only the hash, show the secret once** — exactly like Stripe/GitHub. If the DB leaks,
  keys can't be recovered. The DB check confirmed there is **no** plaintext/secret column.
- **SHA-256, NOT bcrypt, for keys** — bcrypt is intentionally *slow* to protect *low-entropy
  passwords*. API keys are 256 bits of randomness (unbruteforceable), and the gateway must
  verify one on EVERY request. A fast deterministic hash is correct here, and being
  deterministic lets us look a key up by `keyHash` directly. **Right tool for the threat model.**
- **prefix + last4** — gives users a way to recognize a key in a list without us storing the
  secret. The mask `dk_test_••••••••p54M` is purely cosmetic, built from non-secret parts.
- **Soft revoke (timestamp)** — preserves audit/usage history; a key's status is derived
  (`active` / `revoked` / `expired`).
- **Denormalized `organizationId` on the key** — lets the gateway authorize a key against its
  tenant in a single indexed lookup, no join on the hot path.
- **Rotate in a transaction** — old-revoke and new-issue must both succeed or both fail.

### Verified ✅ (full lifecycle, live)
- Create → returns plaintext **once** (`dk_test_…`), `expiresAt` = +30d, masked view, status active.
- List/get → masked only; **no hash or plaintext** ever returned.
- Rotate → old becomes `revoked`, new is `active`, new plaintext + `rotatedFrom` returned.
- Revoke → status `revoked`; double-revoke → **400**.
- DEVELOPER creates on the 3-level nested route → 201 (guard resolves `:orgId` past `:appId`).
- Tenant scope: creating a key for Acme's app via another org's path → **404**.
- **DB proof:** `api_keys` stores `key_hash` (SHA-256) only; column list has no secret field;
  both test keys correctly `revoked`.

### Tech recap
Node `crypto` (`randomBytes`, `createHash` SHA-256), one-time-secret pattern, hash-only storage,
soft-revocation, transactional rotation, denormalization for read performance, and the
**SHA-256-vs-bcrypt** decision (entropy & hot-path latency drive the choice).

---

## Step 7 — API Key Authentication Guard

**Goal:** Let CLIENT APPLICATIONS authenticate with their API key (not a user JWT). This is
the entry point for the whole gateway.

### What we did

1. **`ApiKeyContextData` interface** — the identity a valid key establishes:
   `{ keyId, applicationId, organizationId }`.

2. **`ApiKeyGuard`** — reads the `x-api-key` header, validates via
   `ApiKeysService.findValidByPlaintext` (hash → lookup → reject revoked/expired), records
   usage, and attaches `request.apiKey` + `request.apiKeyContext`.

3. **`@ApiKeyContext()` decorator** — reads that identity in handlers.

4. **GatewayModule + GatewayController** — `GET /api/gateway/whoami`, protected by
   `ApiKeyGuard`, echoes the caller's app/org. The seed of the real gateway (Step 8).

### Why these choices

- **Two distinct auth mechanisms, two distinct headers:**
  | Caller | Guard | Header |
  |---|---|---|
  | Dashboard **user** | `JwtAuthGuard` | `Authorization: Bearer <jwt>` |
  | Client **application** | `ApiKeyGuard` | `x-api-key: <key>` |

  Using a separate header means the two never collide and each route is unambiguous about who
  it expects.
- **Generic 401 for missing/invalid/revoked/expired** — never tell an attacker *why* a key
  failed.
- **Guard attaches identity** — handlers get the app/org for free; no re-query.
- **Usage recorded in the guard** — every authenticated call bumps `usageCount`/`lastUsedAt`.
  We `await` it for correctness now; a high-throughput gateway would batch these or push to a
  queue (a later optimization — exactly what BullMQ in Phase 4 enables).

### Bug found & fixed

- **TS1272 build error** — an interface used as a **decorated parameter type** must be imported
  with `import type` under `isolatedModules` + `emitDecoratorMetadata`. Changed the controller's
  import of `ApiKeyContextData` to `import type`. (A TypeScript-with-decorators gotcha worth
  remembering.)

### Verified ✅ (live)
- Valid `x-api-key` → 200 with `{ keyId, applicationId, organizationId }`.
- Missing key → 401; garbage key → 401.
- **Usage tracking:** 4 calls → `usageCount = 4`, `lastUsedAt` updated.
- **Revoked key → 401** immediately (the soft-revoke from Step 6 is enforced here).

### Tech recap
A second NestJS **authentication guard**, custom auth header, hash-based key lookup,
request-attached identity, usage metering, and the **JWT-vs-API-key** mental model (humans vs
machines). The `import type` decorator gotcha.

---

## Step 8 — Gateway Module & Request Pipeline

**Goal:** Turn the `whoami` seed into a real gateway: a request pipeline with correlation IDs,
response-time measurement, a consistent response envelope, and routing to backend services.

### What we did

1. **`GatewayTimingInterceptor`** — wraps every gateway request to:
   - assign a unique **`requestId`** (UUID) for correlation,
   - measure **response time**,
   - shape a consistent envelope `{ data, meta: { requestId, responseTimeMs, timestamp } }`,
   - set `X-Request-Id` + `X-Response-Time-Ms` headers.

2. **`GatewayService`** — a routing brain with a registry of mock upstreams
   (`users`, `orders`, `payments`). Routes a request to the named service and returns a
   representative response; unknown service → **502 Bad Gateway**.

3. **`GatewayController`** — pipeline `ApiKeyGuard → GatewayTimingInterceptor`, with:
   - `GET /gateway/whoami`, `GET /gateway/upstreams`
   - `ALL /gateway/services/:service` and `.../:service/:resource` (any HTTP method)

### Why these choices

- **Interceptor for cross-cutting concerns** — an interceptor runs BEFORE the handler (start a
  timer, set the id) and transforms the result AFTER (add timing, wrap envelope). That's exactly
  the shape of "measure + decorate every response". This becomes the **single hook point** that
  Step 9 (rate limit) sits beside and Step 10 (logging) reads from.
- **Correlation id set early** — written to the response header BEFORE the handler runs, so it's
  present even on errors (the 502 still carried `X-Request-Id`). Traceability for free.
- **Mock upstreams, real pipeline** — we don't run separate microservices, so routing is
  simulated. But the pipeline (authenticate → route → envelope) is identical to a production
  gateway; only the transport differs. Demonstrates `Client → Gateway → User/Order/Payment`.
- **502 (not 404) for unknown upstream** — the semantically correct gateway status: the gateway
  exists, but it can't reach/route to that backend.
- **`@All`** — one handler serves any HTTP verb, like a real proxy; the method is read from the
  request and echoed (and will be logged in Step 10).

### Pipeline / execution order (worth memorizing)

```
middleware → guards (ApiKeyGuard) → interceptor PRE (id+timer)
          → pipes → handler → interceptor POST (timing+envelope) → response
```

### Verified ✅ (live)
- Envelope `{ data, meta }` present; `X-Request-Id` + `X-Response-Time-Ms` headers set.
- `GET /gateway/services/users` → routed to `mock-users-service`, method `GET`.
- `POST /gateway/services/orders/123` → echoes method `POST`, resource `123`, body `{item,qty}`.
- `GET /gateway/upstreams` → `["users","orders","payments"]`.
- Unknown upstream → **502 Bad Gateway**, and the error response STILL carried `X-Request-Id`.

### Tech recap
NestJS **interceptors** (RxJS `map` to transform responses), the request lifecycle order,
**correlation IDs**, a response **envelope** pattern, `@All` catch-all routing, and the
**API Gateway pattern** (auth → route → respond) with simulated upstreams.

---

## Step 9 — Rate Limiting (Redis)

**Goal:** Protect the gateway. Count requests per organization per minute in Redis, return
**HTTP 429** with standard headers when the plan's limit is exceeded. First use of Redis.

### What we did

1. **`ioredis`** installed; **`RedisModule`** (@Global) provides ONE shared client injected via
   `REDIS_CLIENT`. Closes cleanly on shutdown.

2. **Plan + limit on the org** — `Plan` enum (free=100, pro=5000, enterprise=custom) and a
   `requestsPerMinute` column on `Organization`. Added
   `PATCH /organizations/:id/rate-limit` (OWNER only) to change it.

3. **`RateLimitService`** — fixed-window limiter:
   - counter key `rl:count:{orgId}:{minuteWindow}`, `INCR` each request, `EXPIRE 60s` on first hit;
   - the org's limit is **cached in Redis** (`rl:limit:{orgId}`, 60s TTL) to avoid a DB hit per
     request; owner updates `DEL` the cache key for immediate effect.

4. **`RateLimitGuard`** — runs AFTER `ApiKeyGuard`; consumes one unit, always sets
   `X-RateLimit-Limit/Remaining/Reset`, and throws **429** + `Retry-After` when exceeded.

5. **Wired into the gateway** — `@UseGuards(ApiKeyGuard, RateLimitGuard)`.

### Why these choices

- **Redis, not in-memory** — INCR is atomic (correct under concurrency), keys auto-expire (old
  windows clean themselves), and the counter is **shared across app instances** — a limit must
  hold cluster-wide, which a per-process counter can't guarantee.
- **Per-ORGANIZATION counting** — the plan belongs to the org, so all its API keys share the
  quota. Matches the Free/Pro/Enterprise model in the spec.
- **Cache the limit in Redis** — without it, every gateway request would hit Postgres just to
  read the number. Cached for the window length; invalidated on update (write-through) so
  changes are immediate, not eventually-consistent.
- **Standard `X-RateLimit-*` + `Retry-After` headers** — let well-behaved clients self-throttle
  instead of hammering into 429s. This is how Stripe/GitHub APIs behave.
- **Fixed window** (vs sliding) — simplest to reason about and demonstrate. Trade-off: bursts
  can straddle a boundary (up to 2× near the edge). A sliding-log/leaky-bucket is the
  production upgrade; noted in code.

### Edge case noted in code
A crash between `INCR` and `EXPIRE` could orphan a counter for one window. The atomic fix is a
small **Lua script** (INCR + conditional EXPIRE in one round-trip) — flagged as the production
hardening.

### Verified ✅ (live, Redis inspected)
- Limit 3: requests 1–3 → 200 (`remaining` 2→1→0), request 4 → **429**.
- 429 body: `{statusCode:429, error:"Too Many Requests", message:"…Try again in 24s", limit:3}`
  with `Retry-After`.
- Headers `X-RateLimit-Limit/Remaining/Reset` present on every response.
- Redis held `rl:count:{org}:{window}` and cached `rl:limit:{org}=3`.
- Plan upgrade to **pro** → `requestsPerMinute:5000` applied **immediately** (cache invalidated).
- Non-owner (developer) changing the limit → **403**.

### Debugging notes (test-harness, not app)
Several test re-runs failed on MY side: ambiguous `find by name` picked the wrong org because
**two orgs are both named "Acme Corp"** (the slug-dedup `acme-corp` vs `acme-corp-2` from Step 3).
Fixed by selecting on the unique **slug**. Also wrote `/tmp/jx.js` to stop hand-quoting JSON in
shell. The app behaved correctly throughout.

### Tech recap
**Redis** (INCR/EXPIRE/GET/DEL), fixed-window rate limiting, Redis **caching with
invalidation**, a @Global infrastructure module, guard ordering (auth → limit), and standard
rate-limit HTTP semantics (429, `Retry-After`, `X-RateLimit-*`).

---

## Step 10 — Request Logging

**Goal:** Persist EVERY gateway request to `api_logs` (key, endpoint, method, status, response
time, IP, timestamp) — the raw data the Analytics dashboard (Step 14) will aggregate.

### What we did

1. **ApiLog entity** (`api_logs`) — `requestId`, nullable `organizationId/applicationId/apiKeyId`,
   `method`, `endpoint`, `statusCode`, `responseTimeMs`, `ipAddress`, `userAgent`, plus
   `createdAt` (timestamp). Composite index `(organizationId, createdAt)` for time-range queries.

2. **ApiLogsService** — `record()` (insert, never throws into the request path) and
   `findRecentForOrg()`.

3. **`GatewayLoggingMiddleware`** — generates the `requestId`, sets `X-Request-Id`, records the
   start time, and on the response's **`finish`** event writes the log row (fire-and-forget).

4. **ApiLogsController** — `GET /organizations/:orgId/logs?limit=` (VIEWER+), reusing OrgRolesGuard.

5. **Interceptor refactor** — the timing interceptor now REUSES the middleware's
   `requestId`/`startedAt` so the response envelope's id matches the logged row exactly.

### Why these choices (the key design decision)

- **Middleware + `res.on('finish')`, not the interceptor.** Middleware runs FIRST — before
  guards — so it logs requests that never reach a handler: a **401** from ApiKeyGuard, a **429**
  from RateLimitGuard, a **502** from routing. The `finish` event fires after the response is
  fully sent, so `res.statusCode` is final for every outcome. An interceptor's `map()` only runs
  on the success path and would miss all the failures.
- **Fire-and-forget logging** — `record()` swallows its own errors. Observability must never
  break the actual API call. (At scale these inserts move to a BullMQ queue — Phase 4.)
- **Nullable identity columns** — unauthenticated requests are logged too (valuable for
  security/abuse analysis); they simply have no org/app/key.
- **Org-scoped read with the same RBAC guard** — the logs endpoint is tenant-isolated by the
  query (`where organizationId`), so the null-org unauthenticated rows never leak into a tenant's
  view.

### Bugs found & fixed

1. **`DataTypeNotSupportedError: Data type "Object"`** — columns typed `string | null` make
   reflection emit `Object`, which TypeORM can't map. (Optional `?: string` works; an explicit
   `| null` union does not.) Fixed by declaring explicit `type:` (`'uuid'` / `'varchar'`) on
   those columns. **Lesson:** give nullable-union columns an explicit DB type.
2. Two SQL test queries used snake_case names for camelCase columns (`organizationId`, `createdAt`)
   — my query bug, fixed by quoting the real names.

### Verified ✅ (live + DB inspected)
- 5 mixed requests → 5 rows: `GET whoami 200`, `GET users 200`, `POST orders/55 200`,
  `GET nonsense 502`, `GET whoami 401`. Every row has method, endpoint, status, ms, IP, requestId.
- The **401 (bogus key) was logged** as `unauth` (null org) — proving middleware logs pre-auth
  failures the interceptor would miss.
- Logs API returns newest-first; **org-scoped query excludes the null-org rows** (isolation).
- Non-member reading logs → 403; no token → 401.
- **Correlation:** the `X-Request-Id` returned to the client matched the exact `request_id` row.

### Tech recap
NestJS **middleware** (`NestModule.configure`), the `res.on('finish')` logging pattern, the
middleware-vs-interceptor execution order, **correlation IDs end-to-end**, fire-and-forget
writes, composite indexes, and the `string | null` → explicit-`type` TypeORM gotcha.

---

## Step 11 — Queue Module (BullMQ)

**Goal:** Add Redis-backed background job processing — the foundation for webhooks, analytics,
and emails. Prove it end-to-end with a first working job.

### What we did

1. **Installed `@nestjs/bullmq` + `bullmq`.**

2. **`queue.constants.ts`** — names for all four spec queues (`emails`, `webhooks`, `analytics`,
   `maintenance`). Only `emails` gets a worker now; the rest arrive in their steps.

3. **`EmailsProducer`** — the PRODUCER. `enqueueWelcomeEmail()` pushes a `welcome` job with
   `attempts: 3` + exponential backoff and bounded history (`removeOnComplete/Fail`).

4. **`EmailsProcessor`** — the WORKER (`@Processor(QUEUES.EMAILS)` extends `WorkerHost`). Its
   `process()` runs jobs in the background; `@OnWorkerEvent('completed'|'failed')` log lifecycle.

5. **`QueueModule`** (@Global) — `BullModule.forRootAsync` sets the shared Redis connection;
   `registerQueue` declares the emails queue; exports `EmailsProducer`.

6. **Wired into registration** — `AuthService.register` now enqueues a welcome email (without
   awaiting any send) before returning.

### Why these choices

- **Why a queue at all?** It moves slow/failable work (sending email, delivering webhooks,
  crunching analytics) OFF the request path. Registration returns instantly; the email is sent
  later by a worker. The user never waits on a mail provider.
- **Producer/worker split** — the producer just drops a job in Redis (fast); the worker pulls
  and processes independently. They could even run in separate processes that scale separately —
  the queue decouples them.
- **Built on Redis** — BullMQ stores jobs/queues in Redis (our second Redis feature after rate
  limiting). One infra dependency, two capabilities.
- **Retry + backoff in job options** — transient failures self-heal without custom code. We
  configured it here; we DEMONSTRATE it with real failing deliveries in Step 12 (webhooks),
  where retries are the headline feature.
- **`enqueue` is `await`ed, the WORK is not** — we await the quick "add to Redis" call (so we
  know it was queued) but never await the actual send.

### Verified ✅ (live + Redis inspected)
- Registering a user returned immediately; moments later the worker logged
  `📧 [job 1] Sending welcome email …` then `✅ job 1 (welcome) completed`.
- Redis held BullMQ's structures: `bull:emails:1` (the job), `bull:emails:completed` (zset,
  count 1), plus `events`, `id`, `meta`, `stalled-check`.

### Tech recap
**BullMQ** producer/worker model, `@nestjs/bullmq` (`@Processor`/`WorkerHost`/`@OnWorkerEvent`),
job retry + exponential backoff, Redis-as-job-store, and the async-offload pattern (fast
response, deferred work).

---

## Step 12 — Webhook System

**Goal:** Orgs register webhook endpoints; the platform delivers events to them through the
queue with HMAC signatures, retries + backoff, delivery logs, and a dead-letter queue.

### What we did

1. **Three entities** (per spec):
   - `webhooks` — endpoint config: `url`, `secret` (`whsec_…`), subscribed `events[]`
     (`simple-array`; `['*']` = all), `isActive`.
   - `webhook_events` — an event that occurred: `type`, `jsonb` `payload`.
   - `webhook_deliveries` — one delivery's log: `status` (pending/success/failed/**dead**),
     `attempts`, `responseStatus`, `responseBody`, `lastError`, `deliveredAt`.

2. **WebhooksService** — create/list/get/delete, `dispatchEvent()` (record event → fan out a
   delivery + queue job per subscribed webhook), `testWebhook()`, `listDeliveries()`, and a
   static `sign()` (HMAC-SHA256). Generates `whsec_` secrets.

3. **WebhooksProcessor** (`@Processor(QUEUES.WEBHOOKS)`) — loads the delivery, builds + SIGNS the
   body, `fetch`-POSTs it (8s timeout via `AbortController`), records the result, and THROWS on
   non-2xx/error so BullMQ retries (3 attempts, exp backoff). `@OnWorkerEvent('failed')` marks
   the delivery **DEAD** once retries are exhausted.

4. **WebhooksController** — `/organizations/:orgId/webhooks` (create/list/get/delete/**test**/
   deliveries) with the usual role policy (DEVELOPER manage, ADMIN delete, VIEWER read).

5. **`webhooks` queue** registered in WebhooksModule (`BullModule.registerQueue`), sharing the
   global BullMQ connection from Step 11.

### Why these choices

- **HMAC signatures** — we sign every payload with the webhook's secret and send
  `X-Webhook-Signature: sha256=…`. The receiver recomputes the HMAC over the exact body to
  prove the request is authentic and untampered. (This is exactly how Stripe/GitHub webhooks work.)
- **Delivery via the queue** — sending is slow and failure-prone (the receiver might be down).
  The queue gives us retries, backoff, and isolation from the request path for free.
- **Event → many deliveries** — one event fans out to every subscribed webhook; each delivery is
  tracked independently so one slow receiver doesn't affect others.
- **Two layers of dead-letter** — our `DeliveryStatus.DEAD` makes failures queryable via the API;
  `removeOnFail: false` keeps the raw job in Redis's `bull:webhooks:failed` for replay/inspection.
- **`fetch` with `AbortController` timeout** — a hung receiver can't block a worker forever.

### Bugs found & fixed (test harness, Windows-specific)

1. **Receiver crashed writing `/tmp/recv.log`** — a *Windows* Node process resolves `/tmp/` to a
   non-existent `C:\tmp\`. The crash happened mid-request, so the backend's `fetch` saw a dropped
   connection (looked like a network failure). Fixed by logging to **stdout** instead. Good
   reminder that `/tmp` is a Git-Bash convenience, not real for native Windows processes.
2. Initially suspected an IPv6 `localhost` vs IPv4 mismatch — ruled out once we saw the request
   actually arrived; the crash was the real cause.

### Verified ✅ (live, with a real receiver)
- **Success + signature:** test event delivered to `/ok`; receiver INDEPENDENTLY verified the
  HMAC → `sigValid: true`; delivery `success`, attempts 1, HTTP 200.
- **Retry + DLQ:** webhook → `/fail` (500); worker logged attempt 1 → retry (+1s) → attempt 2 →
  retry (+2s) → **dead-lettered after 3 attempts**; delivery row `dead`/attempts 3/`HTTP 500`;
  Redis `bull:webhooks:failed` held the exhausted jobs.
- Delivery logs queryable via `GET …/webhooks/:id/deliveries`.
- Tables `webhooks`, `webhook_events`, `webhook_deliveries` all created.

### Tech recap
**HMAC-SHA256 signatures**, queue-driven delivery with **retries + exponential backoff**,
**dead-letter queue** (app-level status + Redis-level failed set), native `fetch` +
`AbortController` timeouts, event fan-out, and the event-driven foundation other modules will
emit into via `dispatchEvent()`.

---

## Step 13 — Audit Logs (Event-Driven)

**Goal:** Record the who-did-what compliance trail (login, key created/revoked, member added,
plan changed, webhook added) — built with an **event bus** so modules stay decoupled.

### What we did

1. **`@nestjs/event-emitter`** installed; `EventEmitterModule.forRoot()` registered (global bus).

2. **`audit-event.ts`** — the contract: `AUDIT_EVENT` name + `AuditEventPayload` type. This is
   the ONLY thing emitters import — no dependency on the audit module/service.

3. **AuditLog entity** (`audit_logs`) — `action`, `actorUserId`, `organizationId` (nullable),
   `targetType`, `targetId`, `metadata` (jsonb). Composite index `(organizationId, createdAt)`.

4. **AuditService** (`record`, `findForOrg`), **AuditListener** (`@OnEvent(AUDIT_EVENT)` →
   writes the row, `async: true` so it never blocks the action), **AuditController**
   (`GET /organizations/:orgId/audit-logs`, **ADMIN+** only).

5. **Emitters instrumented at the controller boundary** (no service changes): `user.login`,
   `organization.created`, `member.added`, `organization.plan_changed`, `apikey.created`,
   `apikey.revoked`, `webhook.created`. Each does `events.emit(AUDIT_EVENT, {...})` after the
   action succeeds.

### Why these choices

- **Event-driven decoupling** — the doer announces "this happened" via `EventEmitter2`; the
  audit listener reacts. Crucially, **nothing imports the audit module** — emitters depend only
  on the `AUDIT_EVENT` string + payload type. You can add new reactors (notifications,
  analytics) to the same events later without touching the emitters. (This is the spec's
  "Event-Driven Architecture" concept, made concrete.)
- **No circular dependency** — AuditModule imports OrganizationsModule (for its read route's
  guard), but the reverse edge doesn't exist: org/key/webhook modules reach the bus through the
  globally-provided `EventEmitter2`, not by importing AuditModule.
- **Emit after success, at the controller** — auditing the *result* means failed actions (e.g.
  a 409 on a duplicate member) aren't logged, which is correct. We verified this live.
- **`api_logs` vs `audit_logs`** — two different trails: `api_logs` = client/gateway TRAFFIC;
  `audit_logs` = human/admin ACTIONS. Different audiences, different retention, different access
  (audit is ADMIN-only).
- **`async: true` listener** — the DB write happens detached, so emitting never slows the
  request. AuditService also swallows its own errors (best-effort).

### Bugs found & fixed
- `AuditEventPayload` as a **decorated handler param** needed `import type` (the recurring
  isolatedModules rule). And TypeORM's `insert()` mis-typed the `jsonb` column — switched to
  `create()` + `save()`.

### Verified ✅ (live + DB)
- 5 distinct actions recorded: `apikey.created`, `apikey.revoked`, `organization.plan_changed`,
  `webhook.created`, and `user.login` (×3).
- Org-scoped trail returns the org actions with actor + metadata (key name, plan, webhook url).
- `user.login` rows are **platform-level**: `has_actor=true`, `org_null=true` → correctly absent
  from the org-scoped view.
- `member.added` was correctly NOT logged when the add 409'd (already a member) — auditing the
  successful result.
- RBAC: developer reading audit logs → **403** (ADMIN-only).

### Tech recap
**Event-driven architecture** with `@nestjs/event-emitter` (`EventEmitter2` + `@OnEvent`),
decoupling via an event contract, the audit-vs-traffic-log distinction, and async best-effort
listeners.

---

## Step 14 — Analytics Aggregation

**Goal:** Turn the raw `api_logs` rows (Step 10) into dashboard metrics: totals, success/failure,
error rate, latency (avg/p95/max), top endpoints, and daily usage.

### What we did

1. **AnalyticsService** — four aggregation methods over `api_logs`, all org-scoped + time-windowed:
   - `getSummary` — total / successful / failed / **errorRate** / avg / **p95** / max latency.
   - `getTopEndpoints` — `GROUP BY endpoint, method` with count, avg latency, error count.
   - `getDaily` — `date_trunc('day', …)` time series.
   - `getOverview` — all three in one call (`Promise.all`).

2. **AnalyticsController** — `/organizations/:orgId/analytics/{overview,summary,top-endpoints,daily}`,
   VIEWER+, all accepting `?days=N` (default 30, clamped 1–365).

3. **AnalyticsModule** — `forFeature([ApiLog])` + OrganizationsModule (guard).

### Why these choices

- **Raw SQL aggregation** — `COUNT(*) FILTER (WHERE …)`, `PERCENTILE_CONT(0.95)`, `date_trunc`
  are exactly what databases are great at. Doing it in SQL is dramatically faster than pulling
  rows into Node and looping.
- **p95, not just average** — averages hide tail latency. p95 ("95% of requests were faster
  than this") is the metric that reflects real user experience; we use `PERCENTILE_CONT`.
- **On-demand vs pre-aggregated** — computing live is perfect up to large volumes. Past that,
  a scheduled BullMQ job would roll these same queries into a summary table (read-cheap). The
  raw queries here are the reference that rollup would reproduce — noted in code.
- **Time window + org scope on every query** — analytics is naturally per-tenant and
  per-range; both are always in the `WHERE` clause, and the `(organizationId, createdAt)` index
  from Step 10 makes them fast.
- **Numeric coercion** — the `pg` driver returns `numeric`/`bigint` as strings; we `Number()`
  them in the service so the API returns real numbers.

### Verified ✅ (live, after generating ~30 mixed requests)
- **Summary:** 34 total, 29 ok, 5 failed, errorRate 0.147, avg 9.76ms / p95 21ms / max 21ms.
- **Top endpoints:** ranked by count; `/services/nonsense` correctly shows 5 errors (the 502s),
  others 0; each with its own avg latency.
- **Daily:** one bucket (all traffic is today) with total 34 / errors 5.
- **Overview:** returns `{summary, topEndpoints, daily}` in one call.
- Unauthenticated 401s (null org) are excluded from org analytics; RBAC: non-member → 403.

### Tech recap
Postgres **aggregation** (`COUNT … FILTER`, `PERCENTILE_CONT`, `date_trunc`, `GROUP BY`),
raw parameterized queries via the repository, latency **percentiles**, time-series bucketing,
and the on-demand-vs-rollup trade-off.

---

## Step 15 — Monitoring (Prometheus + Grafana)

**Goal:** Expose the platform's OWN operational health as Prometheus metrics and graph it in
Grafana — separate from the per-tenant business analytics of Step 14.

### What we did

1. **`prom-client`** installed. **MonitoringService** owns a Prometheus `Registry` with:
   - default process metrics (CPU, heap, RSS, event-loop lag, GC) via `collectDefaultMetrics`,
   - `http_requests_total` (counter) + `http_request_duration_seconds` (histogram), labelled
     `method` / `route` / `status`.

2. **MetricsController** — `GET /metrics`, EXCLUDED from the `/api` prefix
   (`setGlobalPrefix(prefix, { exclude: ['metrics'] })`) so Prometheus hits the conventional path.

3. **Metrics middleware** (in `main.ts` via `app.use`) — records every request on `res.on('finish')`
   with the final status, and **normalizes the route label** (uuids → `:id`, numbers → `:n`) to
   keep cardinality bounded.

4. **docker-compose** gained **prometheus** (`:9090`, scrapes `host.docker.internal:3333/metrics`)
   and **grafana** (`:3002`, admin/admin), with `monitoring/prometheus.yml` and a Grafana
   datasource auto-provisioned to point at Prometheus.

### Why these choices

- **Monitoring ≠ Analytics.** Step 14 answers "how is each CUSTOMER using the API?" (business,
  per-tenant, from `api_logs`). Step 15 answers "how healthy is the SERVER right now?"
  (operational: CPU, memory, request rate, latency) — for on-call/ops, not customers.
- **Pull model** — Prometheus *scrapes* `/metrics` on an interval. The app just exposes current
  values; Prometheus owns collection, storage, and alerting. That's why `/metrics` is unauth'd
  and network-restricted rather than token-protected.
- **Route-label normalization is essential** — without it, `/api/organizations/<uuid>` would
  create a new time series per org and blow up Prometheus's memory (a "cardinality explosion").
  Collapsing ids to `:id` keeps the label set small. Verified: 3 calls to different... same-id
  path collapsed to one `:id` series.
- **Histogram for latency** — gives Prometheus the buckets to compute p50/p95/p99 at query time,
  rather than us precomputing one number.
- **Middleware via `app.use`** (not a Nest interceptor) — a plain Express middleware reliably
  sees ALL requests incl. 404s/errors and gets the FINAL status from `finish` (same reasoning as
  the Step 10 logger).
- **Backend stays on the host** — compose runs only the backing services + monitoring;
  Prometheus reaches the host-run app via `host.docker.internal`.

### Verified ✅ (live, full stack)
- `GET /metrics` → 200 at root; `GET /api/metrics` → 404 (prefix exclusion works).
- Output has default process metrics + `http_requests_total{route="/api/organizations/:id",…}`
  (cardinality collapsed) and the duration histogram.
- **Prometheus target `health=up`**, scraping `host.docker.internal:3333/metrics`; a
  `sum(http_requests_total)` query returned a real value.
- **Grafana** healthy (v13), **Prometheus datasource auto-provisioned** as default.

### How to use
```
docker compose up -d                 # brings up pg, redis, prometheus, grafana
# run the backend on the host: npm run start:dev
open http://localhost:9090           # Prometheus (try: sum(rate(http_requests_total[1m])))
open http://localhost:3002           # Grafana (admin/admin) → build dashboards on Prometheus
```

### Tech recap
**prom-client** (Registry, Counter, Histogram, default metrics), the Prometheus **pull/scrape**
model, **metric-label cardinality** discipline, latency **histograms** (server-side percentiles),
global-prefix `exclude`, and Prometheus + Grafana in Docker with datasource provisioning.

---

## Step 16 — Notification System

**Goal:** A unified way to notify orgs across channels (email / Slack / webhook) for platform
events (API limit reached, webhook failure), built on the event bus (Step 13) + queue (Step 11).

### What we did

1. **Notification entity** (`notifications`) — `organizationId`, `type`, `channel`, `title`,
   `message`, `status` (pending/sent/failed), `metadata`, `sentAt`. One row per channel.

2. **Pluggable channel adapters** (Strategy pattern) — `NotificationSender` interface +
   `EmailSender` / `SlackSender` / `WebhookSender` (simulated via logs). A
   `NotificationDispatcher` maps `ChannelType → sender`. Adding a channel = one new class.

3. **NotificationsService.notify()** — fans an alert out to the requested channels: one row per
   channel, each dispatched through the **`notifications` queue** (retry/backoff for free).

4. **NotificationsProcessor** — pulls jobs, calls the dispatcher, marks `sent`/`failed`.

5. **NotificationsListener** — `@OnEvent` handlers that turn domain events into notifications and
   choose channels per event (webhook failure → email+slack; rate limit → email).

6. **Real triggers (decoupled via the event bus):**
   - WebhooksProcessor emits `WEBHOOK_FAILED_EVENT` on dead-letter.
   - RateLimitService emits `RATELIMIT_EXCEEDED_EVENT` exactly once per window
     (when `count === limit + 1`), so we alert without spamming every rejection.

7. **NotificationsController** — `POST …/notifications/test` (ADMIN) and `GET …/notifications`.

### Why these choices

- **Strategy-pattern channels** — each channel is interchangeable behind one interface; the
  dispatcher and the rest of the system don't care how an email vs a Slack message is sent. New
  channels (SMS, push) drop in with zero changes elsewhere.
- **Event bus for triggers** — webhooks and rate-limit just **emit**; they have no idea
  notifications exist (they import only the event name + payload type). The listener decides what
  to do. Same decoupling as audit (Step 13) — and you can add more reactors to the same events.
- **Queue for delivery** — sending is slow/failure-prone (a real email/Slack call), so it goes
  through BullMQ with retries, exactly like webhook deliveries.
- **One row per channel** — independent status/retry per channel; one channel failing doesn't
  affect the others.
- **Emit-once on rate limit** — keying the emit to `count === limit + 1` means a single alert per
  minute window, not one per blocked request.

### Verified ✅ (live + DB)
- **Manual:** test notification across email+slack+webhook → 3 rows, all dispatched
  (📧 💬 🪝 in logs), all `sent`.
- **Webhook-failure trigger:** an unreachable webhook dead-lettered → `webhook.failed`
  notification on email + slack (both `sent`), message naming the delivery/webhook.
- **Rate-limit trigger:** breaching a 3/min limit emitted once → `ratelimit.exceeded`
  notification on email (`sent`).
- `notifications` table: 6 rows across the three types, all `sent`.

### Tech recap
The **Strategy pattern** (pluggable channel adapters), **event-driven triggers** decoupled via
`EventEmitter2`, **queue-backed delivery** (BullMQ retries), and emit-once throttling. This is
the capstone that ties Steps 11 (queue) + 13 (events) together.

---
<!-- Phase 5 complete. Next: Phase 6 — Step 17 API versioning, Step 18 security hardening, Step 19 Docker finalize -->

## Step 17 — API Versioning

**Goal:** Support `/v1`, `/v2` URLs with deprecation warnings and a migration path — without
breaking any of the routes we already built.

### What we did

1. **Enabled URI versioning** in `main.ts`:
   `app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL })`.
   Versioned controllers serve at `/api/v1/…`; everything else stays version-neutral.

2. **`@Deprecated({...})` decorator** + **global `DeprecationInterceptor`** — any route marked
   deprecated automatically gets the standard signalling headers: `Deprecation: true`,
   `Sunset: <date>`, `Link: <migration-guide>; rel="sunset"`, `Warning: 299 - "..."`.

3. **Demo resource** (`widgets`) at two versions:
   - `@Controller({ path: 'widgets', version: '1' })` — deprecated, old shape (`name`).
   - `@Controller({ path: 'widgets', version: '2' })` — current, new shape (`title` + `createdAt`).
   The v1→v2 change models a real breaking schema migration (renamed field, new field).

### Why these choices

- **`VERSION_NEUTRAL` default = zero breakage.** Every controller we built across Steps 1–16 has
  no `@Version`, so it's neutral and keeps serving at `/api/…` (and matches any version). Only the
  new widgets controllers are version-pinned. We added versioning to a 16-step app without
  touching a single existing route.
- **URI versioning** (`/api/v1/…`) over header/media-type versioning — it's the most visible and
  the easiest for clients/curl, matching the spec's `/v1/users` style.
- **Standard deprecation HEADERS, not just docs** — `Sunset`/`Deprecation`/`Warning` let clients
  detect deprecation *programmatically* and even alert before the removal date. The `Link` header
  is the machine-readable "migration tracking" pointer.
- **Interceptor + decorator** — declaring `@Deprecated(...)` on a controller and letting one
  global interceptor enforce the headers keeps it DRY and consistent (same pattern as RBAC).

### Verified ✅ (live)
- `GET /api/v1/widgets` → 200, old shape, with all four deprecation headers
  (`Deprecation`, `Sunset`, `Link`, `Warning`).
- `GET /api/v2/widgets` → 200, new shape, **no** deprecation headers.
- Existing routes unaffected: `/api/health`, `/api/organizations` → 200 (version-neutral).
- `/api/widgets` (no version) → 404; `/api/v3/widgets` (unknown version) → 404.

### Tech recap
NestJS **URI versioning** (`enableVersioning`, `@Controller({ version })`, `VERSION_NEUTRAL`),
**deprecation signalling** via IETF `Sunset`/`Deprecation` headers, and the decorator+global-
interceptor pattern for cross-cutting response headers.

---
<!-- Next: Step 18 — Security hardening (helmet, CORS, global exception filter, sanitization) -->

## Step 18 — Security Hardening

**Goal:** Add the production safety layer before containerizing: secure headers, locked-down
CORS, consistent errors with no leakage, body-size limits, and brute-force throttling.

### What we did

1. **Helmet** — `app.use(helmet())` sets secure response headers (`X-Content-Type-Options:
   nosniff`, `X-Frame-Options`, `Strict-Transport-Security`, a default CSP, etc.).

2. **Config-driven CORS** — `enableCors` reads allowed origins from `CORS_ORIGINS` (`*` in dev,
   an explicit allow-list in prod) with `credentials: true`.

3. **Body-size limit** — disabled Nest's default body parser (`{ bodyParser: false }`) and
   installed `json`/`urlencoded` with a configurable cap (`BODY_LIMIT`, default 1 MB). An
   unbounded parser is a DoS vector.

4. **Global exception filter** (`AllExceptionsFilter`) — one error shape everywhere
   (`{ statusCode, error, message, path, timestamp, requestId? }`). Known `HttpException`s keep
   their status/message; any UNKNOWN error becomes a generic 500 with **no stack trace or
   internal detail** in the response (logged server-side instead).

5. **Auth throttling** — `@nestjs/throttler` `ThrottlerGuard` on the auth controller caps
   login/register at `AUTH_THROTTLE_LIMIT` per `AUTH_THROTTLE_TTL_MS` per IP (15/min) → brute
   force gets 429.

### Why these choices

- **Defence in depth** — each measure blocks a different attack: Helmet (clickjacking/MIME
  sniffing), CORS (hostile browser origins), body limit (memory-exhaustion DoS), throttle
  (credential brute force), exception filter (information disclosure).
- **No internal leakage** — the most important rule: an unexpected error must never return a
  stack trace, SQL text, or file path to the client. The filter logs the detail and returns a
  bland 500. Known client errors (401/403/404/validation) stay informative.
- **Throttle auth specifically** — the gateway already rate-limits client API traffic; the
  *dashboard* auth routes were the unprotected brute-force surface, so the throttle targets them.
- **Sanitization** — handled structurally by the global `ValidationPipe` (`whitelist` strips
  unknown fields → no over-posting; `forbidNonWhitelisted` rejects them; `transform` coerces
  types). Since the API is JSON-only and renders no HTML, output-encoding XSS is a frontend
  concern, deferred to the FE phase.

### Bugs found & fixed (in the filter itself)

1. **401 returned `error: "Internal Server Error"`** — Nest's `UnauthorizedException` body has no
   `error` field, so my fallback used the 500 default. Fixed by deriving the label from the
   status code (a reason-phrase map).
2. **Oversized body returned 500, not 413** — body-parser throws a plain `Error` with a numeric
   `.status` (413), not an `HttpException`, so it hit the generic branch. Fixed by honouring a
   numeric `status`/`statusCode` on thrown errors. (And a TS cast-through-`unknown` nuance.)

### Verified ✅ (live)
- Helmet headers present (`X-Content-Type-Options`, `X-Frame-Options`, HSTS, CSP).
- Error shape consistent: 401 → `Unauthorized`, 404 → `Not Found`, both with `path`/`timestamp`.
- Body > 1 MB → **413 Payload Too Large**.
- CORS headers returned for a cross-origin preflight.
- Auth throttle: 18 rapid login attempts → 15× `401` then 3× `429` (exactly the configured limit).

### Tech recap
**Helmet** (secure headers), **CORS** allow-listing, **request-size limits** (DoS defence),
a **global exception filter** (uniform errors + no info leakage), **@nestjs/throttler**
(brute-force defence), and validation-as-sanitization.

---
<!-- Next: Step 19 — Docker finalize (multi-stage Dockerfile for the app, full compose) -->

## Step 19 — Docker Finalize

**Goal:** Containerize the app itself with a production-grade image and run the whole platform
(app + Postgres + Redis + Prometheus + Grafana) from one `docker compose up`.

### What we did

1. **Multi-stage `Dockerfile`**
   - **builder** stage: `npm ci` (all deps) → `npm run build` (TS → `dist/`).
   - **runner** stage: `npm ci --omit=dev` (prod deps only) + copy `dist/` from builder.
   - Runs as the unprivileged **`node`** user (uid 1000), never root.
   - Self-contained `HEALTHCHECK` hitting `/api/health` via Node's `http` (no curl in alpine).

2. **`.dockerignore`** — keeps `node_modules`, `dist`, `.env`, `.git`, logs out of the build
   context (faster builds, no secrets/junk in the image).

3. **`backend` service in docker-compose** — `build: ./backend`, `depends_on` Postgres+Redis
   **healthy**, env pointing at **service names + internal ports** (`postgres:5432`,
   `redis:6379`) — not the host port mappings. Publishes `3333:3333`.

### Why these choices

- **Multi-stage build** — the toolchain (dev deps, TS compiler, source) stays in the throwaway
  builder; the shipped image carries only prod deps + compiled JS. Smaller (371 MB) and a
  smaller attack surface.
- **Service names, not host ports** — inside the compose network the app reaches Postgres at
  `postgres:5432`, the container's REAL port. The `55432`/`56379` host mappings only exist for
  tools on the host; containers don't use them. This is the #1 thing people get wrong when
  containerizing.
- **Non-root user** — if the app is ever compromised, the attacker isn't root inside the
  container. A baseline hardening expectation.
- **`depends_on: service_healthy`** — the app waits for Postgres/Redis to be *ready*, not just
  *started*, avoiding boot-time connection races.
- **Host-run still supported** — for fast dev you keep using `npm run start:dev` on the host and
  leave the `backend` service stopped; Prometheus reaches either via `host.docker.internal:3333`
  (the published port works for both).

### Verified ✅ (full containerized stack)
- `docker compose build backend` → image built; `up -d backend` → **healthy**, waited for
  Postgres/Redis health first.
- From the host: `/api/health` → DB `up`; login works (shared Postgres volume has the data);
  `/api/organizations` works; `/metrics` → 200; Helmet header present.
- Runs as **`node`** (uid 1000), image **371 MB**.
- Redis/queue works in-container (welcome-email job processed).
- Prometheus target still `health=up`.

### How to run the whole platform
```
docker compose up -d            # postgres, redis, backend, prometheus, grafana
curl http://localhost:3333/api/health
# Grafana http://localhost:3002 (admin/admin) · Prometheus http://localhost:9090
docker compose down             # stop all (add -v to wipe data)
```

### Tech recap
**Multi-stage Docker builds**, **non-root containers**, **`.dockerignore`**, container
**networking by service name** vs host ports, `depends_on` health conditions, and a
container-native healthcheck.

---

# 🎉 Backend Complete (Steps 1–19)

The platform now implements the full Phase-1 spec, each step built incrementally, verified live,
and documented above:

**Foundation:** NestJS + TypeScript, config + Joi validation, TypeORM/Postgres, Redis, health.
**Identity & tenancy:** JWT auth, bcrypt, multi-tenant organizations, membership, **RBAC** (role
hierarchy via guards/decorators).
**Core platform:** applications, **API keys** (hash-only, rotate/revoke/expire), API-key auth.
**Gateway:** request pipeline (correlation IDs, timing envelope), **Redis rate limiting** (429),
**request logging** to `api_logs`.
**Async & events:** **BullMQ** queues, **webhooks** (HMAC signatures, retries, DLQ), **audit
logs** (event-driven).
**Observability:** **analytics** (SQL aggregation, p95), **Prometheus + Grafana** monitoring,
multi-channel **notifications**.
**Hardening:** **API versioning** + deprecation, **security** (Helmet, CORS, throttle, global
error filter, body limits), **Docker** (multi-stage, non-root, full compose).

Tables: users, organizations, organization_members, applications, api_keys, api_logs, webhooks,
webhook_events, webhook_deliveries, audit_logs, notifications.

> Local ports on this machine: backend **3333**, Postgres **55432**, Redis **56379**,
> Prometheus **9090**, Grafana **3002** (chosen to avoid conflicts with software already
> installed here).

**Not yet built (spec Phase 2 / future):** API marketplace, billing, feature flags, developer
portal — and the **frontend**, which is the next phase of this project.

---

# Advanced Features (Phase 2 of the spec)

## Step 20 — Feature Flags

**Goal:** Enable/disable features per organization, and gate routes behind flags (ship dark,
turn on per-tenant).

### What we did
- **`feature_flags` table** — per-org `(key, enabled)` overrides (`@Unique(orgId, key)`).
- **Central flag catalogue** (`KNOWN_FLAGS`) — each flag has a description + default; only
  overrides are stored, unset flags use the default.
- **FeatureFlagsService** — `list` (effective state), `isEnabled`, `set` (upsert, rejects
  unknown keys).
- **`@RequireFeature(key)` + `FeatureGuard`** — declaratively gate any route; 403 if the org
  doesn't have the feature on. Demo route `advanced-analytics-demo` proves it.
- **Controller** — list (VIEWER), toggle (ADMIN).

### Why these choices
- **Catalogue, not free strings** — typos rejected; the UI can enumerate every toggle.
- **Store only overrides** — defaults live in code; a fresh org needs zero rows.
- **Guard + decorator** — same declarative pattern as RBAC; gating is one line on a route. This
  is how real platforms roll out features gradually and sell tiered capabilities.

### Verified ✅
- Flags list shows defaults (`webhooks=true`, others false).
- Gated route: feature OFF → **403**, ON → **200** 🎉.
- Unknown flag → 404; viewer toggling → 403 (ADMIN only).

### Tech recap
Per-tenant **feature flags**, default-catalogue pattern, and **feature gating** via a
guard+decorator (ship-dark / progressive rollout / tiered features).

<!-- Next: Step 21 — Billing (subscription plans, usage tracking, overage) -->

---

## Step 21 — Billing System

**Goal:** Subscription plans, usage tracking, and overage charges (Free / Pro / Enterprise).

### What we did
- **`subscriptions`** (one per org): plan, monthly quota, price, overage rate, current period.
- **`billing_records`** (invoices): an immutable snapshot of a period's usage + computed charge.
- **`PLAN_TERMS`** catalogue — quota/price/overage/rate-limit per plan (the rate-limit value is
  shared with Step 9, so billing and throttling never disagree).
- **BillingService** — `subscribe` (sets plan AND syncs the gateway rate limit), `getUsage`
  (live), `closeInvoice` (snapshot), `listInvoices`. **Usage is COUNTED from `api_logs`** for the
  current period — no separate meter, the gateway logs already are the meter.
- **Controller** — subscription/usage/invoices (VIEWER), subscribe (OWNER), close (ADMIN).

### Why these choices
- **`numeric` for money** — never floats; exact cents.
- **Usage = `COUNT(api_logs)` in the period** — reuse the existing event stream as the meter
  instead of maintaining a parallel counter that could drift.
- **Subscribe drives the rate limit too** — one action changes both the bill and the throttle via
  the existing `OrganizationsService.updateRateLimit`, keeping plan state consistent everywhere.
- **Invoices are snapshots** — a `billing_record` freezes the numbers so a bill stays correct
  even if raw logs are later pruned.
- **Overage billed per started 1,000 block** — `ceil(overage / 1000) × ratePer1k`, like real API
  pricing.

### Verified ✅ (live, incl. a real overage)
- Lazy FREE subscription on first access; subscribe to PRO → quota 1M, $49/mo, $0.50/1k overage.
- Usage computed from `api_logs` (39 real requests → $49 base, no overage).
- **Overage demo:** injected 1,000,100 synthetic requests → used 1,000,139, overage 139 →
  overageCost **$0.50** → total **$49.50**. (Synthetic rows then deleted.)
- Invoice closed into `billing_records`; owner-only subscribe enforced (developer → 403).

### Tech recap
**Subscription billing**, **usage metering reusing the log stream**, **overage math**, exact
`numeric` money, immutable invoice snapshots, and plan/rate-limit consistency.

<!-- Next: Step 22 — API Marketplace (publish APIs, subscribe) -->

---

## Step 22 — API Marketplace

**Goal:** Organizations publish APIs others can discover and subscribe to — gated by the
`api_marketplace` feature flag (Step 20).

### What we did
- **`marketplace_apis`** — published listings (owner org, name, slug, category, version, baseUrl,
  visibility, status, price).
- **`marketplace_subscriptions`** — an org's subscription to a published API (`@Unique(subscriber,
  api)`).
- **MarketplaceService** — `publish`, `listOwned`, `browse` (public catalog), `getPublished`,
  `subscribe`, `listSubscriptions`, `unsubscribe`.
- **Two controllers:** org-scoped publish/subscribe (`/organizations/:orgId/marketplace`, **gated
  by `@RequireFeature('api_marketplace')`**) and the public catalog (`/marketplace`, any logged-in
  user).

### Why these choices
- **Feature-gated commercial capability** — publishing/subscribing only works when the org has the
  marketplace flag on; the catalog (storefront) is open. This is the Step-20 feature gate doing
  real work — exactly how SaaS sells tiers.
- **Two surfaces** — a tenant-scoped management API and a global discovery API, mirroring
  RapidAPI's "publish vs browse".
- **Unique (subscriber, api)** — no duplicate subscriptions; second attempt → 409.

### Verified ✅ (live)
- Publish **without** the feature → **403**; after enabling `api_marketplace` → publish succeeds.
- Acme published "Weather API" ($19.99) + "Payments API"; public catalog lists both.
- RBAC-Test subscribed to Weather API → active; duplicate → 409; subscription list shows it.
- Tables `marketplace_apis`, `marketplace_subscriptions` created.

### Tech recap
A **two-sided marketplace** (publish + subscribe + discover), **feature-gated** monetizable
capability, and tenant-scoped vs public API surfaces.

<!-- Next: Step 23 — Developer Portal (OpenAPI/Swagger docs + Postman collection) -->

---

## Step 23 — Developer Portal

**Goal:** API documentation, an interactive playground, Postman collection, and SDK guidance —
all generated from one OpenAPI spec.

### What we did
- **`@nestjs/swagger`** + the CLI plugin (`nest-cli.json` → `"plugins": ["@nestjs/swagger"]`),
  which **auto-derives schemas from our DTOs** — no manual `@ApiProperty` across 20 modules.
- **Swagger UI at `/docs`** (the interactive **playground** — try-it-out with bearer/api-key auth)
  and the raw **OpenAPI spec at `/docs-json`**, wired in `main.ts` with a `DocumentBuilder`
  (title/version + `addBearerAuth` + `addApiKey('x-api-key')`).
- **DeveloperPortalService** — holds the generated spec (handed over from `main.ts`) and derives:
  - a **Postman Collection v2.1** (one request per route, `{{baseUrl}}`/`{{accessToken}}`/
    `{{apiKey}}` variables),
  - **SDK generation** commands (openapi-generator for typescript/python/go).
- **DeveloperPortalController** — `/developer-portal` (index), `/postman`, `/sdks`.

### Why these choices
- **OpenAPI as the single source of truth** — docs, playground, Postman, and SDKs are ALL
  generated from the spec, so they never drift from the real API. Hand-written docs rot; generated
  ones can't.
- **CLI plugin over manual annotation** — introspects DTOs/return types automatically; we got
  50-path docs with near-zero annotation effort.
- **Public portal** — docs/SDKs are discoverable (no auth) like every real developer portal; the
  playground itself lets you paste a token to call protected routes.

### Verified ✅ (live)
- `/docs` → 200, Swagger UI (playground). `/docs-json` → OpenAPI 3.0.0, **50 paths**, security
  schemes `bearer` + `api-key`.
- `/api/developer-portal` index lists all resources.
- Postman collection: **68 request items**, correct variables, sample URL `{{baseUrl}}/api/auth/login`.
- SDK info returns typescript-axios / python / go generation commands.

### Tech recap
**OpenAPI/Swagger** (`@nestjs/swagger` + CLI plugin), an interactive **API playground**,
**spec-driven** Postman/SDK generation, and the single-source-of-truth documentation principle.

---

# 🏁 Advanced Features Complete (Steps 20–23)

Spec **Phase 2** delivered, each step built + verified live + documented:
- **Feature Flags** — per-org toggles + route gating (ship-dark / tiered features)
- **Billing** — plans, usage metered from `api_logs`, overage charges, invoices
- **API Marketplace** — publish / browse / subscribe, gated by a feature flag
- **Developer Portal** — Swagger docs + playground, Postman export, SDK generation

New tables: feature_flags, subscriptions, billing_records, marketplace_apis,
marketplace_subscriptions. **The backend now implements the ENTIRE spec (Phase 1 + Phase 2).**

---

## Step 24 — Real Payments (Stripe, test mode)

**Goal:** Make plan subscriptions actually take money. Previously "subscribe" was an
instant entitlement grant (no charge); now paid plans go through Stripe Checkout, and
the plan only activates once payment succeeds.

### What we did
- **`StripeService`** — wraps the Stripe SDK. **Optional**: if `STRIPE_SECRET_KEY` is
  unset, it stays disabled and the Stripe endpoints return **501**, so the app still
  runs (and the frontend falls back to the instant, metering-only plan switch).
- **Subscription entity** — added `stripeCustomerId` + `stripeSubscriptionId`.
- **Endpoints** (`/organizations/:orgId/billing`):
  - `GET config` → `{ paymentsEnabled }` (lets the UI choose checkout vs. instant).
  - `POST checkout` (OWNER) — creates a **Stripe Checkout Session** (subscription mode,
    recurring `price_data` from `PLAN_TERMS`) and returns its URL; FREE downgrades
    immediately (and cancels the Stripe sub).
  - `POST checkout/confirm` (OWNER) — verifies a returned session and activates the plan,
    so the happy path works locally **without** the Stripe CLI.
  - `POST portal` (OWNER) — Stripe Billing Portal link (manage card / cancel).
- **Webhook** — `POST /api/billing/webhook` (public, separate controller). `main.ts`
  mounts `express.raw` for just that path (and skips JSON parsing) so the **raw body** is
  available for signature verification. Handles `checkout.session.completed`,
  `customer.subscription.updated/deleted`, `invoice.paid` (→ paid `billing_record`),
  `invoice.payment_failed` (→ `past_due`).

### How to enable
1. Put a Stripe **test** secret key (`sk_test_…`) in `backend/.env` →
   `STRIPE_SECRET_KEY=…`. The compose backend env interpolates it from `.env`.
2. `docker compose up -d backend` (or run on host). `config` now reports
   `paymentsEnabled: true`; the Billing page switches to "Upgrade → Stripe Checkout".
3. Pay with test card `4242 4242 4242 4242`, any future expiry/CVC.
4. (Optional, for webhooks) `stripe listen --forward-to localhost:3333/api/billing/webhook`
   and set the printed `whsec_…` as `STRIPE_WEBHOOK_SECRET`. Not required locally — the
   `/confirm` return step already activates the plan.

### Why this shape
- **Optional/graceful** — no key ⇒ the whole app still works (demo mode), so contributors
  aren't blocked on Stripe credentials.
- **`/confirm` + webhook** — webhooks are the production source of truth, but relying on
  them alone makes local testing need the Stripe CLI; confirming the session on return
  removes that friction without weakening production.

### Marketplace paid subscriptions (same model)

Subscribing to a **paid** marketplace API now also goes through Stripe (charging the
subscriber), so both "subscribe" flows are consistent:
- Free API (or Stripe off) → instant access grant. Paid API → Stripe Checkout, with a
  matching `confirm` endpoint and a `stripeSubscriptionId` on the subscription row.
- **One Stripe customer per org**, shared between platform plan and marketplace
  (`BillingService.ensureCustomer`).
- **Decoupling:** the webhook controller verifies the payload and re-emits it as an
  internal `stripe.webhook` event; `BillingService` and `MarketplaceService` each
  `@OnEvent` and handle only their own slices (`metadata.kind` = `platform` |
  `marketplace`; invoices matched by subscription id). This avoids a billing⇄marketplace
  module cycle.
### Publisher payouts (Stripe Connect)

Paid marketplace subscriptions now pay the **publisher**, not just the platform:
- Each org can become a publisher by onboarding a **Stripe Connect (Express)** account
  (`stripeConnectAccountId` on the subscription row): `POST …/marketplace/connect/onboard`
  returns a Stripe onboarding URL; `GET …/marketplace/connect/status` reports
  `chargesEnabled`.
- When someone subscribes to a **paid** API, the Checkout subscription uses
  `transfer_data.destination` = the publisher's connected account and
  `application_fee_percent` = **10%** (the platform's cut). Subscribing is **blocked**
  with a clear message if the publisher hasn't finished payout setup.
- Frontend: the Marketplace "Published" tab shows payout status + a "Set up payouts"
  button (ADMIN+), and handles the onboarding return.

**Note — nothing charges until a key is set.** All of the above (plans + marketplace +
payouts) is dormant while `STRIPE_SECRET_KEY` is empty: the app stays in demo mode and
subscribing is an instant, free grant. Add a `sk_test_…` key (with Connect enabled in
the Stripe test dashboard) to see real Checkout + split payouts.

---

## Step 25 — Organization Types (Publisher vs Subscriber)

**Goal:** Separate the two sides of the marketplace into distinct account types with
their own dashboards.

- **`OrganizationType`** = `publisher | subscriber`, chosen at org creation and fixed.
  Column added to `organizations` (existing rows default to `subscriber`).
- **Enforcement** (`OrganizationsService.assertType` → 403):
  - PUBLISHER may publish APIs + set up payouts; **cannot** subscribe.
  - SUBSCRIBER may browse/subscribe + use apps/keys/analytics; **cannot** publish.
- A single user can own one of each and switch between them via the org switcher —
  each renders a **different dashboard**.
- **Frontend:** type picker in the Create-Organization dialog; type-aware sidebar nav
  (publisher: Dashboard · Organizations · My APIs · Payouts · Billing · Docs /
  subscriber: + Applications · API Keys · Analytics · Marketplace); split the old
  marketplace page into **My APIs** + **Payouts** (publisher) and **Marketplace**
  browse/subscriptions (subscriber); `RequireOrgType` route guard shows a "switch org"
  prompt if you open the wrong section.
- **Demo seed** creates two **separate accounts** (publisher and subscriber are
  different real-world parties, so they're different logins — not one user owning both):
  - `publisher@example.com` / password123 → org **Acme APIs** (PUBLISHER), 2 published APIs.
  - `subscriber@example.com` / password123 → org **Acme Labs** (SUBSCRIBER): apps, API
    keys, ~75k request logs (analytics + billing), and subscriptions to Acme's APIs.
  Cross-account access is denied (403) — each only sees its own org. The subscriptions
  are seeded directly so the demo doesn't depend on completing real Stripe checkout.

---

## Step 26 — Publisher Earnings + `account.updated` webhook

- **Earnings** — `GET /organizations/:orgId/marketplace/earnings` computes recurring
  revenue from active subscriptions to the org's published APIs: total subscribers,
  gross MRR, the 10% platform fee, net MRR, and a per-API breakdown (computed from our
  own records, so it works in demo mode). The **publisher Dashboard** now shows earnings
  stats (instead of the request analytics a subscriber sees), and the **Payouts page**
  shows the per-API table.
- **`account.updated` webhook** — keeps payout readiness current. Added a cached
  `payoutsEnabled` flag on the subscription row; the webhook updates it from
  `charges_enabled` when a connected account changes (e.g. onboarding completes), and
  `getConnectStatus` also refreshes it live on read. The frontend connect-status query
  uses `refetchOnWindowFocus`, so returning to the app reflects the latest status even
  without the webhook (the webhook makes it current server-side regardless).

## Step 27 — Simplified onboarding (pick a type at signup; no Org/App sections)

Removed the multi-step "create organization → create application → make keys" ceremony.

- **Signup picks a type** (`RegisterDto.type` = publisher | subscriber). `AuthService.register`
  now **auto-provisions the workspace**: one org of that type, plus a default `application`
  for subscribers (so API keys have a home). `AuthModule` imports Organizations +
  Applications modules (no circular dep — neither imports auth).
- **No backend schema change** — the org/application concepts stay for tenant scoping;
  they're just created automatically and never surfaced as setup steps.
- **Frontend:** the Register page has a Subscriber/Publisher selector; the sidebar nav
  dropped **Organizations** and **Applications**; the org switcher is replaced by a static
  workspace name + type badge in the topbar; the **API Keys** page binds to the single
  default app (no app selector). Deleted the now-unused Organizations/Applications pages,
  dialogs, and the switcher.
- **Seed** registers two accounts and reuses their auto-provisioned workspaces.
- Verified: fresh subscriber signup → 1 workspace + 1 "Default" app; fresh publisher → 1
  workspace, 0 apps; signup without a type → 400.

### Payout-readiness uses the `transfers` capability (not `charges_enabled`)

Marketplace revenue reaches publishers via destination-charge **transfers**, so a
publisher only needs to *receive* transfers — they aren't taking direct card charges.
`getConnectStatus` therefore reports `payoutsReady` based on
`account.capabilities.transfers === 'active'`, and the paid-subscribe gate + the
`account.updated` cache key off that. Using `charges_enabled` (the old check) wrongly
forced publishers through full merchant onboarding (incl. `card_payments`) they don't
need. Verified live: a transfers-active account → `payoutsReady: true` → paid subscribe
returns a real Stripe Checkout session.
