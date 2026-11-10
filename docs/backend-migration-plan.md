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
  auth/              register, login, refresh (rotating, hashed in DB, reuse detection), logout, change-password; global JWT + Roles guards, rate limits
  users/             User entity, password hashing; GET/PATCH me (ownership by token, not :id)
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

| Entity                      | Key columns / relations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                      | table **`app_user`** (`user` is reserved in Postgres); email and username **`citext`**, unique regardless of case; username 2–50 characters, any script and spaces, no `@` or control characters (a DB check repeats the DTO rule); passwordHash (bcrypt, `select: false`; Strapi's `$2a$10$` hashes are kept and re-hashed at the next login); phone, address (≤ 500); role enum `customer\|editor\|admin`; blocked; **emailVerifiedAt** (nullable; cleared when the email changes to another address); timestamps |
| `RefreshToken`              | user ManyToOne (`ON DELETE CASCADE`), **familyId** (one login session), tokenHash (SHA-256, unique; the token itself is never stored), expiresAt (idle 7d), familyExpiresAt (30d max), revokedAt (set on rotation, logout and revocation; kept for reuse detection)                                                                                                                                                                                                                                                 |
| `Media`                     | url (relative, `/uploads/<random>.jpg`), **name** (the uploader's file name), mime, size, width, height, alt, `formats` jsonb (`large`/`medium`/`small`/`thumbnail`: url, width, height), folder                                                                                                                                                                                                                                                                                                                    |
| `ProductCategory`           | name, slug (unique), position                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Product`                   | slug, title, description, image → Media, weight, **calories**, **price `integer` in kopiykas** (exact sums; `pg` returns `numeric` as a string), available, featured, favorite, categories ManyToMany (join table `product_to_category`)                                                                                                                                                                                                                                                                            |
| `Order`                     | table **`customer_order`** (`order` is reserved in SQL); **number** (identity `GENERATED ALWAYS`, unique: the readable order number); user ManyToOne (nullable, `ON DELETE SET NULL`), name, email, phone, address (required for delivery: DB check), shippingMethod enum `delivery\|pickup`, comments, status enum `new\|processing\|declined\|completed` (transitions in `canTransition()`), subtotal (kopiykas, ≥ 0), `legacyDishesText` (migrated orders only)                                                  |
| `OrderItem`                 | order ManyToOne (`ON DELETE CASCADE`), **position** (unique per order), product ManyToOne (nullable, `ON DELETE SET NULL`), **snapshot** title + unitPrice, quantity (> 0), lineTotal (a DB check: `unit_price * quantity`)                                                                                                                                                                                                                                                                                         |
| `BlogCategory` / `BlogPost` | name/slug; title, slug, text (markdown), image → Media, seo (embedded), categories ManyToMany, publishedAt                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Page`                      | slug (unique; the homepage is simply the page with slug `home`), title, seo (embedded), publishedAt                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `PageSection`               | page ManyToOne, position, `type` enum (10 types), `data` jsonb validated per type (class-validator DTO per type); references stored as ids (productIds, categoryId, blogCategoryId, mediaIds) and **resolved on read**                                                                                                                                                                                                                                                                                              |
| `Menu` / `MenuItem`         | key `header\|footer\|dropdown`; title, link, className, group `main\|list`, position                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `SiteSettings`              | single row: siteName, phone, address, workingHours, takingOrdersHours, facebook, instagram, seo                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ContactSubmission`         | name (≤ 100), email, message (1–5000, DB check), handledAt                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `AccountToken`              | single-use links sent by email: user ManyToOne (`ON DELETE CASCADE`), purpose enum `password_reset\|email_verification`, tokenHash (SHA-256, unique; the token is never stored), **email** (the address the link went to: a changed email voids it), expiresAt (1 h / 48 h), usedAt                                                                                                                                                                                                                                 |

`Seo` is an embedded TypeORM class (`seo_title`, `seo_description`, `seo_share_image_id` → Media, `ON DELETE SET NULL`), used by settings, pages and blog posts. `shareImage` fixes the frontend's dead OG-image code path.

**Page sections.** 10 types (`page_section_type` enum): `image-banner`, `products`, `benefits`, `articles`, `image-gallery`, `video`, `news`, `content`, `contact`, `promo`. The stored `data` shape per type lives in `src/content/entities/section-data.ts`; every writer (data migration, admin) must run `validateSectionData()`. References are ids in jsonb (no foreign keys), resolved on read in a fixed number of queries; a deleted row becomes `null` or drops out of its list. `products` sections are resolved server-side (available products only; `selected` keeps the editor's order). `news` sections resolve only their blog category: the client loads the paginated posts with `GET /api/blog-posts?category=<slug>`. Strapi field names map to camelCase (`custom_ID` → `anchorId`, `Benefit`/`article` → `items`, `content2` → `secondaryContent`, `form`/`form_title` → `showForm`/`formTitle`, ...).

## Public API (clean, camelCase, `{data, meta}` envelope)

- `GET /api/settings`
- `GET /api/menus/:key`
- `GET /api/products?category=&featured=&page=&pageSize=`
- `GET /api/product-categories`
- `GET /api/pages/:slug` (the homepage is `home`): published pages only; sections come back fully resolved, with media objects and products embedded.
- `GET /api/blog-posts?category=<slug>&page=&pageSize=`: published posts only, newest first; items carry an `excerpt`, not the full text.
- `GET /api/blog-posts/:slug`: drafts and scheduled posts are a 404, like unknown slugs.
- `GET /api/blog-categories`
- `POST /api/auth/register` (201) and `POST /api/auth/login`: `{data: {accessToken, expiresIn, refreshToken, refreshTokenExpiresAt, user}}`.
- `POST /api/auth/refresh`: a new pair; the token sent is used up. A used token sent again after a 10 s grace window ends its whole session (reuse detection).
- `POST /api/auth/logout`: 204, ends that session (also for an unknown token).
- `POST /api/auth/change-password` (login needed): ends every session and returns a new pair; a notice goes to the account's email.
- `POST /api/auth/forgot-password {email}`: always 204, at once; if an active account has the email, a link to `{FRONTEND_URL}/reset-password#token=…` (1 hour, single use) is emailed.
- `POST /api/auth/reset-password {token, newPassword}`: 204; ends every session, marks the email verified, sends a notice; doesn't log in. An unusable token is 400 `INVALID_TOKEN`.
- `POST /api/auth/verify-email {token}`: 204 (no login needed); the link `{FRONTEND_URL}/verify-email#token=…` (48 hours) is emailed at registration, after an email change, and by `POST /api/auth/resend-verification` (login needed; 204, nothing sent once verified).
- `GET /api/users/me`, `PATCH /api/users/me`: `emailVerified` in the profile. Changing the email needs `currentPassword`; the new address gets a verification link and the old one a notice (a change of letter case only is the same address).
- Every route needs `Authorization: Bearer <accessToken>` unless it's marked `@Public()` (or `@OptionalAuth()`: `POST /orders`). Rate limits (no global limit): login 5/min per IP + identifier, then a 5-minute block; register 10/hour per IP; refresh and logout 30/min per IP; change-password 5/min and `PATCH /users/me` 10/min per account; orders 10/hour per account (guests per IP); contact 5/hour and forgot-password 3/hour per IP + email; reset-password and verify-email 10/hour per IP; resend-verification 3/hour per account. A 429 carries `Retry-After`.
- `POST /api/orders` with body `{items:[{productId, quantity}], name, phone, email, address, shippingMethod, comments}` (201). The server loads prices, rejects unknown or unavailable products (409 `PRODUCTS_UNAVAILABLE` with the bad lines in `details`), and computes totals; a client-sent price is a 400. Guests may also order: a token is optional (but must be valid if sent) and `email` is required. The shop and the customer are emailed.
- `GET /api/orders/me`: the caller's order history, newest first, paginated (new feature). Linked by the token at order time, never by email.
- `POST /api/media` (admins and editors; multipart `file`, optional `alt`, `folder`): 201 `MediaDto`. JPEG, PNG or WebP by content (415 otherwise), ≤ 10 MB (413), ≤ 40 megapixels and not animated (400 `INVALID_IMAGE`); stored upright, ≤ 2560 px, without metadata, with Strapi's sizes. `PATCH /api/media/:id {alt, folder}`, `DELETE /api/media/:id` (204; whatever showed the image shows none). 100 uploads/hour per account.
- `GET /uploads/<name>`: the files, outside `/api`, cached for a year (`immutable`), `Cross-Origin-Resource-Policy: cross-origin`.
- `POST /api/contact`: 204; saved, then the shop is emailed (`Reply-To`: the sender). A filled honeypot field (`website`) gets a 204 and is dropped.

The OpenAPI spec comes from `@nestjs/swagger` at `/api/docs`. Optionally, generate the frontend types from it with `openapi-typescript`.

## Admin (AdminJS at `/admin`)

- **ESM interop.** AdminJS v7 is ESM-only. Load it with dynamic `import()` inside `AdminModule.createAdminAsync`, following the pattern of the official adminjs nestjs example. Do not convert the whole app to ESM.
- **Auth.** Use `buildAuthenticatedRouter` against `User` with role `admin|editor`. Sessions are stored in Postgres via `connect-pg-simple`.
- **Resources.** Products, categories, orders (status editable; items shown read-only), users (no password field; a "reset password" action), blog, menus (MenuItem with drag ordering by `position`), site settings (single record), contact submissions, and media (`@adminjs/upload` with a custom provider that reuses `MediaService`, so sharp variants are generated).
- **Page sections.** Add one custom component, `SectionEditor.tsx`, registered via `ComponentLoader`, for `PageSection.data`. It switches on `type` and renders the matching form fields, plus pickers for products, media and blog categories. Ship v1 with a JSON editor and validation on save, then build the per-type forms.
- **Dashboard.** Add a custom dashboard component with orders by status, today's orders and new contact messages.

## Data migration (`src/strapi-import/`, `npm run import:strapi`)

A one-off import, compiled with the app (it uses the entities) and run from `dist/` like the migration scripts. It reads `backend/.tmp/data.db` with Node's built-in `node:sqlite` (no native dependency) and writes through the TypeORM DataSource in **one transaction**, compared with the source before it commits. `--dry-run` rolls back; it refuses a database that has data unless `--replace` empties the imported tables. Usage: README, "Importing the Strapi data".

- **Drafts.** Strapi 5 stores a draft and a published row per document. Take rows with `published_at IS NOT NULL` (exactly one per document in this database). Relations may point at either row: they are resolved through `document_id`.
- **Media.** All 79 `files` rows become `Media` with the same `/uploads/<hash>.jpg` URLs; the 219 files (originals and Strapi's sizes, which match ours) are copied into `UPLOADS_DIR` as they are, nothing reprocessed. `size`: kilobytes → bytes; `formats`: url, width, height; `folder` from the upload folder's name (`Products` → `products`). **`alternative_text` is the file name on all 75 files that have one** (Strapi's default): imported as no alt text. Only the `image` field of products is read: the 28 `Image` links are Strapi 4 leftovers.
- **Users.** The bcrypt hashes are copied as they are, so passwords keep working (upgraded to cost 12 at the next login). All 4 are customers. **Not marked verified:** Strapi had `email_confirmation` off, so it set `confirmed` on every account without checking anything. Create the admin user separately (phase 7).
- **Dynamic zones.** `pages_cmps` (`body`) and `homepages_cmps` (`Body`) in `order`; each component becomes a `PageSection` through `validateSectionData()`, with relations and media as the new ids; selected products keep their link order. The homepage is the page with slug `home`.
- **Menus.** Only the fields in the current schema. The published dropdown also has 6 items under an old `MenuListItem` field, which Strapi no longer shows (two link to pages that don't exist): left out.
- **Orders.** `dishes` → `legacyDishesText`, with no items; `amount` (hryvnias) → `subtotal` in kopiykas; all `delivery` (Strapi stored no shipping method; one without an address would become `pickup`); numbered afresh by date.
- **Checks** (before commit): per-entity counts, products with an image, product-category links, every page's section types and order, menu items, the sum of order totals. A difference stops the import and saves nothing.
- **Real data** (2026-11-10): 79 media, 14 categories, 41 products (all with an image), 1 blog category, 2 posts, settings, 10 + 5 + 8 menu items, 10 pages with 42 sections, 4 users, 7 orders, 4 contact messages. No warnings.

## Frontend changes (`frontend/`)

- `src/shared/utils/helpers/api.ts`: rename `getStrapiURL` to `getApiURL`, drop the bracket-heavy `qs` usage and keep the envelope handling.
- Entity API and type files: `src/entities/{Options,Menu,Product,PageData,BlogData,PostData,User,Order}/{api,types|model}`. Switch to the new endpoints and camelCase fields. The components that read `Body/Title/Name/Benefit/menuItem` (`SectionWizard`, the menu widgets, `NewsWidget`, `ProductList`) need their fields renamed.
- `src/features/Auth/api/authenticatedFetch.ts`: rename the token fields (`jwt` → `accessToken`), and **make concurrent requests share one refresh** (a second refresh with the same token gets a 401).
- `app/api/auth/{login,register,refresh,logout}/route.ts`: point at the new endpoints.
  - Keep the refresh token in the httpOnly cookie: `maxAge` from `refreshTokenExpiresAt`, path narrowed to `/api/auth`. Store the new token after every refresh (the old one is used up).
  - `register` must strip the refresh token from what it returns to the browser, like `login`.
  - `logout` must send the refresh token to the API, so the session ends on the server.
  - Forward `X-Forwarded-For`, or the API sees only the Next server's IP.
- Consider keeping the access token in memory instead of `localStorage`.
- The password form → `POST /auth/change-password`; the minimum password length is now 8 (was 7).
- `src/widgets/CheckoutForm` and `src/features/Order/placeOrder/api/api.ts`: send `items[]` and `shippingMethod` instead of the `dishes` string and `amount`.
- `src/widgets/UserInfo`: switch from `PUT /users/:id` to `PATCH /users/me`; an email change sends `currentPassword`.
- `app/api/contact/route.ts`: switch to `/api/contact`, send the `website` honeypot field, and forward `X-Forwarded-For`.
- Checkout (from phase 4): an **email field for guests** (pre-filled for logged-in users), `shippingMethod` `delivery\|pickup` (pickup sends no address), the order number on the success screen, a 409 `PRODUCTS_UNAVAILABLE` message per line, and an order history page (`GET /orders/me`).
- Account emails (from phase 4): **`/reset-password` and `/verify-email` pages** that read the token from `#token=`, POST it, and send `Referrer-Policy: no-referrer`. The current reset form calls Strapi without the code and is broken. Show `emailVerified` with a "resend" button in the account page.
- `next.config.ts`: `remotePatterns` must list the new API host and port (`localhost:1339` locally); image URLs stay `API_URL + media.url`.
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
   - ✅ Done (2026-10-28): media, catalog (products, categories), settings and menus, blog (published-only, excerpts), pages with 10 section types resolved without N+1, and `Seo.shareImage`. Read endpoints only; every list is paginated and ordered with an id tie-breaker; all covered by unit and Testcontainers e2e tests.
3. **Auth and users.** Add rotating refresh tokens, guards, and the roles admin, editor and customer.
   - ✅ Done (2026-11-05): `app_user` (citext email and username) and `refresh_token` tables; register, login (email or username; Strapi hashes accepted and upgraded), refresh with rotation, reuse detection and 7-day idle / 30-day maximum sessions, logout, change-password; `GET`/`PATCH /users/me`. Fail-closed global `JwtAuthGuard` with `@Public()`, `RolesGuard` with `@Roles()`. Rate limits on the auth routes and `PATCH /users/me`; `Cache-Control: no-store` on token and profile responses; logs never contain tokens, hashes, passwords or query parameters. Swagger documents the bearer scheme, every error code and the 429s. Covered by unit tests and Testcontainers e2e tests.
4. **Orders, contact and mail.** Server-side pricing, order items, throttling, and email notifications.
   - ✅ Done (2026-11-06): nodemailer 10 `MailService` (sent after the commit in the background, 2 retries, drained at shutdown, never logs addresses or bodies; tests use an in-memory transport); `customer_order` (readable `number`) and `order_item` with price snapshots; `POST /orders` for guests and users (prices only from the database, 409 for unavailable products, optional login) and `GET /orders/me`; `POST /contact` with a honeypot; forgot/reset password and email verification with single-use hashed tokens bound to their address (`account_token`), links with the token in the URL fragment; notices for password and email changes; per-route rate-limit keys (`@ThrottleBy`). 3 migrations. Covered by unit tests, Testcontainers e2e tests and a manual Mailpit run.
   - **Carried over:** a mail outbox table with a worker if lost emails ever matter; a delivery fee; customers cancelling their own orders; online payment; SMS.
5. **Media.** Uploads with sharp variants and static `/uploads` serving.
   - ✅ Done (2026-11-10): `POST`/`PATCH`/`DELETE /api/media` for admins and editors (the first `@Roles()` routes; `ApiAuth({ roles })` documents the 403); `MediaService` recognises JPEG/PNG/WebP by their bytes, refuses SVG, animations, damaged files and over-40-megapixel images, re-encodes without metadata (GPS), turns photos upright, caps them at 2560 px and makes Strapi's four sizes with sharp 0.35; random file names on local disk (`UPLOADS_DIR`) behind a swappable `MEDIA_STORAGE`; `/uploads` served by the API with immutable caching and a cross-origin resource policy. One migration (`Media.name`). Covered by unit tests, Testcontainers e2e tests and a manual run.
   - **Carried over:** S3 storage; WebP/AVIF copies (Next.js converts in production for now); a cleanup job for files no row points to; non-image files (PDFs).
6. **Data migration script.** Run it against a copy of production `data.db`.
   - ✅ Done (2026-11-10): `npm run import:strapi` (`src/strapi-import/`): published content, media and files, customers with their password hashes, orders and contact messages, in one transaction checked against Strapi before it commits; `--dry-run` and `--replace`. Run against the local copy of `data.db` into the dev database. Covered by unit tests and a Testcontainers e2e test with a Strapi-shaped SQLite fixture.
7. **AdminJS.** CRUD resources first, then auth, then the section editor (JSON first, then per-type forms), then the dashboard.
   - From phase 5: the upload field and a media picker call `MediaService` (never write files directly). A blocked editor keeps API access until the access token expires (≤ 15 min, phase 3 D3), as every account does.
   - From phase 4: order status changes go through `canTransition()`; mark contact messages handled; the dashboard shows new orders and unhandled messages.
   - From phase 3: a `create-admin` CLI command; blocking a user calls `RefreshTokensService.revokeAllForUser` (their access token still works until it expires, at most 15 min); admin-only API routes get `@Roles()`, and `ApiAuth()` should then document their 403.
8. **Frontend adaptation** on a branch, run against the local Nest API.
   - Auth (from phase 3): see the auth items under "Frontend changes".
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
   - **Uploads (from phase 5):** a Docker volume for `UPLOADS_DIR` (owned by the `node` user), included in the nightly backups next to `pg_dump`. Optionally let nginx serve `/uploads` directly, with the same headers (immutable cache, `Cross-Origin-Resource-Policy: cross-origin`, `nosniff`).
   - **Mail (from phase 4):** a production SMTP provider (`SMTP_*`; `requireTLS` is on in production unless `SMTP_SECURE`), **SPF, DKIM and DMARC** for the `MAIL_FROM` domain or the mail lands in spam, and an https `FRONTEND_URL`.
   - **Before going live (from phase 3):** set `TRUST_PROXY_HOPS` to the number of proxies in front of the API, and make every proxy (nginx and the Next route handlers) forward `X-Forwarded-For`. Until then register and refresh limits count the whole site as one client. Generate a production `JWT_ACCESS_SECRET` (`openssl rand -base64 48`).
   - Rate-limit counters live in memory, per process: switch the throttler to Redis storage before running more than one API instance. Once real client IPs arrive, consider a looser per-IP login cap on top of the per-account one (password spraying).
   - Freeze Strapi edits, then run the import from the production image (`node dist/strapi-import/import-strapi.js --sqlite … --uploads …` with the SQLite file and Strapi's uploads mounted read-only, and the uploads volume): `--dry-run` first, then for real into the empty production database. Smoke-test and switch over.
   - Keep Strapi and the SQLite file for rollback for about 2 weeks.
   - Set up nightly `pg_dump` backups.

## Verification

- **Unit tests:** order pricing (rejects tampered prices and unavailable products), section DTO validation, refresh-token rotation and reuse detection.
- **e2e:** Jest with supertest against Postgres via Testcontainers. Cover every public endpoint and the auth flow: login → 401 on expiry → refresh → retry. Cover ownership: user A cannot read or update user B's data or orders.
- **Migration check:** count assertions, plus spot-checks that every product has an image and that each page's section order and types match Strapi.
- **Frontend:** `npm test` passes. Run `npm run dev` against the local API and click through the homepage, all 9 CMS pages, a news post, register/login, account update, and checkout (verify the order and items in AdminJS), plus the contact form (verify the email in a Mailpit container).
- **Admin:** log in at `/admin`, edit a product image (variants generated), reorder menu items, edit a page section, and check the result on the site.
