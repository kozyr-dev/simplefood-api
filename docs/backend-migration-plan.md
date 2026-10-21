# SimpleFood: Strapi → NestJS + PostgreSQL + TypeORM + AdminJS

## Context

`backend/` is a stock **Strapi 5.39** app on **SQLite** (`.tmp/data.db`, 2.4 MB). It was migrated from v4 and runs under pm2 on a VPS. It has **no custom code**: every controller, service and route is a `createCore*` one-liner, and `src/index.js` is empty. All business logic is either in the frontend or missing.

- 12 content types and 16 components. Pages and the homepage use dynamic zones with 10 section types.
- Data: 41 products, 14 categories, 9 pages, 2 blog posts, 7 orders, 4 users, 79 media files plus their variants.

`frontend/` is **Next 16 / React 19**, organised with Feature-Sliced Design, using react-query and zustand. It calls Strapi via `fetchAPI` and `fetchWithAuth`. The access JWT is kept in localStorage, and the refresh token sits in an httpOnly cookie set by `app/api/auth/*`. The cart is client-side. Orders are sent as `{dishes: "text", amount: clientTotal}`, so the server trusts the client's price.

**My view of the idea: worth doing, with the right expectations.**

- **What you gain:**
  - real server-side business logic, such as order line items, server-computed totals, ownership checks and notifications
  - Postgres in place of a single SQLite file that gets copied around `git pull`
  - typed and tested code you control
  - no more Strapi major-version migrations
- **What you lose:** the features Strapi gives you for free, which must be rebuilt:
  - auth with refresh tokens
  - media uploads with responsive formats
  - the page-builder admin UX

  The page builder is the hardest of these.

- **Decisions made:** a clean API (not Strapi-compatible) with the frontend's API layer adapted to it, and AdminJS for the admin. AdminJS stays behind a clean boundary, so a Refine SPA could replace it later without touching the data model.

**Urgent, independent of the rewrite.** Production Strapi currently has these permission problems:

- The Public role has `order.find/findOne`, so anyone can read every order's name, phone, address and email.
- Public also has `user.find/findOne` and `email.send`.
- The Authenticated role sees all orders and can call `user.update` on any user.

Fix these today in Strapi Admin → Settings → Users & Permissions → Roles.

## Working mode

- This is a learning project, built to **production grade**. The user writes the code. Claude guides each phase: what to build and why, the relevant NestJS/TypeORM concepts, and reference snippets when asked. Claude also reviews the user's code and debugs with them.
- Claude does not implement phases unless the user explicitly asks.
- This plan lives at `api/docs/backend-migration-plan.md`, under version control. Tick off phases here as they are completed.
- **Production-grade baseline for every phase:**
  - strict TypeScript, oxlint and Prettier
  - env validation; migrations only, never `synchronize`
  - DTO validation; consistent error shape
  - structured logging (`nestjs-pino`) with request ids
  - rate limiting, security headers (Nest's built-in `app.useSecurityHeaders()`) and CORS
  - unit and e2e tests in CI
  - graceful shutdown, health checks, a Docker image and database backups

## Target architecture

New repo `SimpleFood/api/`, a sibling of `backend/` and `frontend/`. Strapi keeps running until cutover.

```text
api/src/
  main.ts            bootstrap; app.setup.ts holds the HTTP pipeline (security headers, CORS, ValidationPipe, global prefix /api)
  config/            @nestjs/config + Joi env schema, registerAs namespaces
  database/          TypeORM DataSource, migrations/ (synchronize: false), seeds/
  common/            pagination DTO, response envelope {data, meta}, exception filter {error:{status,code,message,requestId,details?}}
  auth/              local login, register, refresh (rotating, hashed in DB), logout/revoke, JWT guard, Roles guard
  users/             me, update-me (ownership by token, not :id)
  catalog/           products, product-categories
  content/           pages + sections, menus, site-settings
  blog/              posts, categories
  orders/            create (server-priced), my orders; status workflow
  contact/           submissions + email notification
  media/             multer upload, sharp → thumbnail/small/medium/large, local disk /uploads (S3-ready interface)
  mail/              nodemailer (order + contact notifications)
  admin/             AdminJS (@adminjs/nestjs, @adminjs/typeorm, @adminjs/upload)
  health/            @nestjs/terminus
```

Versions: Node 24 everywhere (`.nvmrc`, Docker, CI). NestJS 12, TypeORM 1.x on `pg`, PostgreSQL 18.

## Data model (TypeORM entities)

| Entity                      | Key columns / relations                                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                      | email (unique), username (unique), passwordHash (bcrypt), phone, address, role enum `customer\|admin\|editor`, blocked, timestamps                                                                                     |
| `RefreshToken`              | user ManyToOne, tokenHash, expiresAt (idle 7d), familyExpiresAt (30d max), revokedAt                                                                                                                                   |
| `Media`                     | url, mime, size, width, height, alt, `formats` jsonb, folder                                                                                                                                                           |
| `ProductCategory`           | name, slug (unique), position                                                                                                                                                                                          |
| `Product`                   | slug, title, description, image → Media, weight, **calories**, price `numeric(10,2)`, available, featured, favorite, categories ManyToMany                                                                             |
| `Order`                     | user ManyToOne (nullable), name, email, phone, address, shippingMethod enum, comments, status enum `new\|processing\|declined\|completed`, subtotal, `legacyDishesText` (migrated orders only)                         |
| `OrderItem`                 | order ManyToOne, product ManyToOne (nullable), **snapshot** title + unitPrice, quantity, lineTotal                                                                                                                     |
| `BlogCategory` / `BlogPost` | name/slug; title, slug, text (markdown), image → Media, seo (embedded), categories ManyToMany, publishedAt                                                                                                             |
| `Page`                      | slug (unique; the homepage becomes slug `home` with `isHomepage`), title, seo (embedded), publishedAt                                                                                                                  |
| `PageSection`               | page ManyToOne, position, `type` enum (10 types), `data` jsonb validated per type (class-validator DTO per type); references stored as ids (productIds, categoryId, blogCategoryId, mediaIds) and **resolved on read** |
| `Menu` / `MenuItem`         | key `header\|footer\|dropdown`; title, link, className, group `main\|list`, position                                                                                                                                   |
| `SiteSettings`              | single row: siteName, phone, address, workingHours, takingOrdersHours, facebook, instagram, seo                                                                                                                        |
| `ContactSubmission`         | name, email, message, handledAt                                                                                                                                                                                        |

`Seo` is an embedded TypeORM class (`seoTitle`, `seoDescription`, `shareImage` → Media). Adding `shareImage` fixes the frontend's dead OG-image code path.

## Public API (clean, camelCase, `{data, meta}` envelope)

- `GET /api/settings`
- `GET /api/menus/:key`
- `GET /api/products?category=&featured=&page=&pageSize=`
- `GET /api/product-categories`
- `GET /api/pages/home`
- `GET /api/pages/:slug`: sections come back fully resolved, with media objects and products embedded.
- `GET /api/blog/posts?category=<slug>&page=&pageSize=`
- `GET /api/blog/posts/:slug`
- `POST /api/auth/login | register | refresh | logout`: returns `{accessToken, refreshToken, user}`.
- `GET /api/users/me`, `PATCH /api/users/me`
- `POST /api/orders` with body `{items:[{productId, quantity}], name, phone, email, address, shippingMethod, comments}`. The server loads prices, rejects unavailable products, and computes totals. Guests may also order: user is optional and `email` is required.
- `GET /api/orders/me`: order history (new feature).
- `POST /api/contact`: rate-limited with `@nestjs/throttler`; sends a notification email.

The OpenAPI spec comes from `@nestjs/swagger` at `/api/docs`. Optionally, generate the frontend types from it with `openapi-typescript`.

## Admin (AdminJS at `/admin`)

- **ESM interop.** AdminJS v7 is ESM-only. Load it with dynamic `import()` inside `AdminModule.createAdminAsync`, following the pattern of the official adminjs nestjs example. Do not convert the whole app to ESM.
- **Auth.** Use `buildAuthenticatedRouter` against `User` with role `admin|editor`. Sessions are stored in Postgres via `connect-pg-simple`.
- **Resources.** Products, categories, orders (status editable; items shown read-only), users (no password field; a "reset password" action), blog, menus (MenuItem with drag ordering by `position`), site settings (single record), contact submissions, and media (`@adminjs/upload` with a custom provider that reuses `MediaService`, so sharp variants are generated).
- **Page sections.** Add one custom component, `SectionEditor.tsx`, registered via `ComponentLoader`, for `PageSection.data`. It switches on `type` and renders the matching form fields, plus pickers for products, media and blog categories. Ship v1 with a JSON editor and validation on save, then build the per-type forms.
- **Dashboard.** Add a custom dashboard component with orders by status, today's orders and new contact messages.

## Data migration (`api/scripts/migrate-from-strapi.ts`)

This is a one-off script. It reads `backend/.tmp/data.db` with better-sqlite3 and writes through the TypeORM DataSource, so it can be re-run idempotently on a clean database.

- **Drafts.** Strapi 5 stores a draft and a published row per document. Take rows with `published_at IS NOT NULL`. For orders and contacts, take one row per `document_id`.
- **Media.** Map `files` to `Media`. Resolve links through `files_related_mph`, using only the field `image`/`Image` that matches the current schema, and skip the 28 orphaned v4 `Image` links on products. Copy `backend/public/uploads` across.
- **Users.** Strapi stores bcrypt hashes, so copy them as they are. Existing users keep their passwords. Create the admin user separately (via a seed or CLI command).
- **Dynamic zones.** Read `components_sections_*` and `*_cmps` tables in order, map each to `PageSection{type, position, data}`, and turn component relations into ids.
- **Orders.** Copy `dishes` into `legacyDishesText`, with no items.
- **Checks.** Print per-entity counts and compare them with the Strapi document counts (41 products, 14 categories, 9 pages, and so on).

## Frontend changes (`frontend/`)

- `src/shared/utils/helpers/api.ts`: rename `getStrapiURL` to `getApiURL`, drop the bracket-heavy `qs` usage and keep the envelope handling.
- Entity API and type files: `src/entities/{Options,Menu,Product,PageData,BlogData,PostData,User,Order}/{api,types|model}`. Switch to the new endpoints and camelCase fields. The components that read `Body/Title/Name/Benefit/menuItem` (`SectionWizard`, the menu widgets, `NewsWidget`, `ProductList`) need their fields renamed.
- `src/features/Auth/api/authenticatedFetch.ts`: rename the token fields.
- `app/api/auth/{login,register,refresh,logout}/route.ts`: point at the new endpoints. `logout` should now also revoke the refresh token on the server.
- `src/widgets/CheckoutForm` and `src/features/Order/placeOrder/api/api.ts`: send `items[]` and `shippingMethod` instead of the `dishes` string and `amount`.
- `src/widgets/UserInfo`: switch to `PATCH /users/me`.
- `app/api/contact/route.ts`: switch to `/api/contact`.
- `next.config.ts`: update `remotePatterns` only if the API host changes.
- Fix existing bugs along the way:
  - product list capped at 25 by Strapi's default limit
  - `calories` vs `callories` mismatch
  - news post SEO querying `/pages` (`app/(main)/news/[slug]/page.tsx`)
- Update the Jest tests in `src/features/**` for the new payloads.

## Phases

0. **Now:** fix the Strapi public and authenticated permissions (see Context).
1. **Scaffold.** Set up the Nest app, config, TypeORM with Postgres in `docker-compose` (api, postgres, volume for uploads), migrations, health check, Swagger, and CI (lint, tests).
   - ✅ Done (2026-10-21): Node 24 / Nest 12 scaffold, Postgres 18 + Mailpit in Docker Compose, Joi-validated config (`registerAs` namespaces), TypeORM 1.x with migrations and a snake_case naming strategy, `/health`, security headers, validation pipe and a single error shape, `nestjs-pino` logging with request IDs, Swagger at `/api/docs`, and GitHub Actions CI (e2e tests and migration checks run on Testcontainers).
   - The production Docker image moved to phase 9, where the app is ready to deploy. Only `.dockerignore` exists so far.
2. **Core domain.** Build the entities, the first migration, and the read endpoints (catalog, content, blog, settings, menus) with the section resolver.
3. **Auth and users.** Add rotating refresh tokens, guards, and the roles admin, editor and customer.
4. **Orders, contact and mail.** Server-side pricing, order items, throttling, and email notifications.
5. **Media.** Uploads with sharp variants and static `/uploads` serving.
6. **Data migration script.** Run it against a copy of production `data.db`.
7. **AdminJS.** CRUD resources first, then auth, then the section editor (JSON first, then per-type forms), then the dashboard.
8. **Frontend adaptation** on a branch, run against the local Nest API.
9. **Cutover.**
   - **Production Docker image first** (moved here from phase 1). `.dockerignore` already exists: an allow-list of `package*.json`, `src/`, `nest-cli.json` and the tsconfigs.
     - **`Dockerfile`, 3 stages on `node:24-alpine`:** `build` (`npm ci`, `nest build`, so the Swagger plugin runs); `deps` (`npm ci --omit=dev`); `runtime`. Use npm cache mounts and bind-mounted `package*.json`. If `sharp` (phase 5) has trouble on Alpine's musl, switch to `bookworm-slim`.
     - **Runtime stage:** `NODE_ENV=production`, `NODE_OPTIONS=--enable-source-maps`. Copy `dist/`, production `node_modules` and **`package.json`** (the Swagger version reads it) with `--chown=node:node`, then `USER node` and `EXPOSE 1339`. Use `CMD ["node", "dist/main.js"]` in exec form, never `npm start`, so SIGTERM reaches Node and the shutdown hooks run. Run with `init: true` (or `--init`).
     - **Health check:** a small `src/healthcheck.ts` that `fetch`es `/health` with a 2 s timeout and exits 0 or 1 (Alpine has no curl). `HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=2s --retries=3 CMD ["node", "dist/healthcheck.js"]`.
     - **Migrations:** add a `migration:run:prod` script (`typeorm migration:run -d dist/database/data-source.js`, no build) and run it as a one-off container from the same image before starting the new version.
     - **Architecture:** Apple Silicon builds `linux/arm64`. Build in CI (amd64) or with `--platform linux/amd64`, and check `uname -m` on the VPS.
     - **CI:** add a `docker` job that builds the image, starts it next to a Postgres container, waits for `healthy`, and checks `/health`. Publish to GHCR with commit-SHA tags (for rollbacks) in the deploy workflow.
     - **Done when:** the image is under about 250 MB; it has no dev tools, sources or `.env`; it runs as `uid=1000(node)`; it refuses to start with bad config; it turns healthy; it writes JSON logs; `docker stop` takes about a second; migrations run from the image; stack traces point to `src/*.ts`. Also look at `docker scout cves` and Docker Hardened Images.
   - Deploy Postgres and the API with Docker Compose on the VPS, behind the same `api-simplefood.kozyr.info` domain.
   - Freeze Strapi edits, run the migration, smoke-test, and switch over.
   - Keep Strapi and the SQLite file for rollback for about 2 weeks.
   - Set up nightly `pg_dump` backups.

## Verification

- **Unit tests:** order pricing (rejects tampered prices and unavailable products), section DTO validation, refresh-token rotation and reuse detection.
- **e2e:** Jest with supertest against Postgres via Testcontainers. Cover every public endpoint and the auth flow: login → 401 on expiry → refresh → retry. Cover ownership: user A cannot read or update user B's data or orders.
- **Migration check:** count assertions, plus spot-checks that every product has an image and that each page's section order and types match Strapi.
- **Frontend:** `npm test` passes. Run `npm run dev` against the local API and click through the homepage, all 9 CMS pages, a news post, register/login, account update, and checkout (verify the order and items in AdminJS), plus the contact form (verify the email in a Mailpit container).
- **Admin:** log in at `/admin`, edit a product image (variants generated), reorder menu items, edit a page section, and check the result on the site.
