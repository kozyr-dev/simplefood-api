# SimpleFood: Strapi → NestJS + PostgreSQL + TypeORM + react-admin

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

- **Decisions made:** a clean API (not Strapi-compatible) with the frontend's API layer adapted to it, and an admin app built with react-admin on top of admin endpoints in the API. (The first plan was AdminJS; phase 7 replaced it, see "Admin".)

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
  <module>/controllers/admin-*.controller.ts   the admin API (/api/admin/*), in each domain module
api/admin/           the admin app: react-admin (Vite, React), served by the API at /admin
  health/            @nestjs/terminus
```

Versions: Node 24 everywhere (`.nvmrc`, Docker, CI). NestJS 12, TypeORM 1.x on `pg`, PostgreSQL 18.

## Data model (TypeORM entities)

| Entity                      | Key columns / relations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                      | table **`app_user`** (`user` is reserved in Postgres); email **`citext`**, unique regardless of case, the only login; **name** 2–100 characters, not unique, any characters but control ones (a DB check repeats the length; until phase 8.1 it was a unique `username`, 2–50, without `@`); passwordHash (bcrypt, `select: false`; Strapi's `$2a$10$` hashes are kept and re-hashed at the next login); phone, address (≤ 500); role enum `customer\|editor\|admin`; blocked; **emailVerifiedAt** (nullable; cleared when the email changes to another address); timestamps |
| `RefreshToken`              | user ManyToOne (`ON DELETE CASCADE`), **familyId** (one login session), tokenHash (SHA-256, unique; the token itself is never stored), expiresAt (idle 7d), familyExpiresAt (30d max), revokedAt (set on rotation, logout and revocation; kept for reuse detection)                                                                                                                                                                                                                                                                                                          |
| `Media`                     | url (relative, `/uploads/<random>.jpg`), **name** (the uploader's file name), mime, size, width, height, alt, `formats` jsonb (`large`/`medium`/`small`/`thumbnail`: url, width, height), folder                                                                                                                                                                                                                                                                                                                                                                             |
| `ProductCategory`           | name, slug (unique), position                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Product`                   | slug, title, description, image → Media, weight, **calories**, **price `integer` in kopiykas** (exact sums; `pg` returns `numeric` as a string), available, featured, favorite, categories ManyToMany (join table `product_to_category`)                                                                                                                                                                                                                                                                                                                                     |
| `Order`                     | table **`customer_order`** (`order` is reserved in SQL); **number** (identity `GENERATED ALWAYS`, unique: the readable order number); user ManyToOne (nullable, `ON DELETE SET NULL`), name, email, phone, address (required for delivery: DB check), shippingMethod enum `delivery\|pickup`, comments, status enum `new\|processing\|declined\|completed` (transitions in `canTransition()`), subtotal (kopiykas, ≥ 0), `legacyDishesText` (migrated orders only)                                                                                                           |
| `OrderItem`                 | order ManyToOne (`ON DELETE CASCADE`), **position** (unique per order), product ManyToOne (nullable, `ON DELETE SET NULL`), **snapshot** title + unitPrice, quantity (> 0), lineTotal (a DB check: `unit_price * quantity`)                                                                                                                                                                                                                                                                                                                                                  |
| `BlogCategory` / `BlogPost` | name/slug; title, slug, text (markdown), image → Media, seo (embedded), categories ManyToMany, publishedAt                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Page`                      | slug (unique; the homepage is simply the page with slug `home`), title, seo (embedded), publishedAt                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `PageSection`               | page ManyToOne, position, `type` enum (10 types), `data` jsonb validated per type (class-validator DTO per type); references stored as ids (productIds, categoryId, blogCategoryId, mediaIds) and **resolved on read**                                                                                                                                                                                                                                                                                                                                                       |
| `Menu` / `MenuItem`         | key `header\|footer\|dropdown`; title, link, className, group `main\|list`, position                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SiteSettings`              | single row: siteName, phone, address, workingHours, takingOrdersHours, facebook, instagram, seo                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `ContactSubmission`         | name (≤ 100), email, message (1–5000, DB check), handledAt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `AccountToken`              | single-use links sent by email: user ManyToOne (`ON DELETE CASCADE`), purpose enum `password_reset\|email_verification`, tokenHash (SHA-256, unique; the token is never stored), **email** (the address the link went to: a changed email voids it), expiresAt (1 h / 48 h), usedAt                                                                                                                                                                                                                                                                                          |

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
- `POST /api/auth/register` (201) and `POST /api/auth/login` (`{email, password}`: by email only, since phase 8.1): `{data: {accessToken, expiresIn, refreshToken, refreshTokenExpiresAt, user}}`.
- `POST /api/auth/refresh`: a new pair; the token sent is used up. A used token sent again after a 10 s grace window ends its whole session (reuse detection).
- `POST /api/auth/logout`: 204, ends that session (also for an unknown token).
- `POST /api/auth/change-password` (login needed): ends every session and returns a new pair; a notice goes to the account's email.
- `POST /api/auth/forgot-password {email}`: always 204, at once; if an active account has the email, a link to `{FRONTEND_URL}/reset-password#token=…` (1 hour, single use) is emailed.
- `POST /api/auth/reset-password {token, newPassword}`: 204; ends every session, marks the email verified, sends a notice; doesn't log in. An unusable token is 400 `INVALID_TOKEN`.
- `POST /api/auth/verify-email {token}`: 204 (no login needed); the link `{FRONTEND_URL}/verify-email#token=…` (48 hours) is emailed at registration, after an email change, and by `POST /api/auth/resend-verification` (login needed; 204, nothing sent once verified).
- `GET /api/users/me`, `PATCH /api/users/me`: `emailVerified` in the profile. Changing the email needs `currentPassword`; the new address gets a verification link and the old one a notice (a change of letter case only is the same address).
- Every route needs `Authorization: Bearer <accessToken>` unless it's marked `@Public()` (or `@OptionalAuth()`: `POST /orders`). Rate limits (no global limit): login 5/min per IP + email, then a 5-minute block; register 10/hour per IP; refresh and logout 30/min per IP; change-password 5/min and `PATCH /users/me` 10/min per account; orders 10/hour per account (guests per IP); contact 5/hour and forgot-password 3/hour per IP + email; reset-password and verify-email 10/hour per IP; resend-verification 3/hour per account. A 429 carries `Retry-After`.
- `POST /api/orders` with body `{items:[{productId, quantity}], name, phone, email, address, shippingMethod, comments}` (201). The server loads prices, rejects unknown or unavailable products (409 `PRODUCTS_UNAVAILABLE` with the bad lines in `details`), and computes totals; a client-sent price is a 400. Guests may also order: a token is optional (but must be valid if sent) and `email` is required. The shop and the customer are emailed.
- `GET /api/orders/me`: the caller's order history, newest first, paginated (new feature). Linked by the token at order time, never by email.
- `POST /api/media` (admins and editors; multipart `file`, optional `alt`, `folder`): 201 `MediaDto`. JPEG, PNG or WebP by content (415 otherwise), ≤ 10 MB (413), ≤ 40 megapixels and not animated (400 `INVALID_IMAGE`); stored upright, ≤ 2560 px, without metadata, with Strapi's sizes. `PATCH /api/media/:id {alt, folder}`, `DELETE /api/media/:id` (204; whatever showed the image shows none). 100 uploads/hour per account.
- `GET /uploads/<name>`: the files, outside `/api`, cached for a year (`immutable`), `Cross-Origin-Resource-Policy: cross-origin`.
- `POST /api/contact`: 204; saved, then the shop is emailed (`Reply-To`: the sender). A filled honeypot field (`website`) gets a 204 and is dropped.

The OpenAPI spec comes from `@nestjs/swagger` at `/api/docs`. Optionally, generate the frontend types from it with `openapi-typescript`.

## Admin (react-admin at `/admin`, admin API at `/api/admin`)

**Why not AdminJS** (checked 2026-11-11, with a trial run of each in a scratch copy): AdminJS had no release since 2025-07; `@adminjs/typeorm` requires TypeORM 0.3 (`ERESOLVE` against 1.1), needs Active Record entities and swallows save errors; `@adminjs/nestjs` is ESM-only with an `import`-only export, so our CommonJS build can't load it; its edit action saves whatever is posted (hidden fields included); its login doesn't regenerate the session or re-check the user; it needs `unsafe-inline` scripts, and adds ~180 MB of runtime dependencies. Refine moved to maintenance mode (2026). react-admin 5.15 (MIT, React 19, MUI 9) was active; its trial worked with our API and our strict CSP unchanged.

- **D1 Architecture.** A react-admin app calling `/api/admin/*`. Every write goes through Nest controllers, DTOs, guards, throttling, logging and Swagger, so `canTransition()`, `validateSectionData()` and `MediaService` protect the admin like any client.
- **D2 Location.** `api/admin/`, its own npm package (Vite, React, TypeScript), built to `api/admin/dist` and served by Nest at `/admin`, same origin. In development Vite (:5173) passes `/api` through to :1339.
- **D3 Admin endpoints** live in their domain module (`catalog/controllers/admin-products.controller.ts`); shared pieces in `common/admin/`.
- **D4 List contract:** `page`, `pageSize` (≤ 100), `sort` (allow-list, always including `id`: react-admin's reference inputs sort by it), `order`, `q`, `id` (repeatable: getMany), per-resource filters; `{data, meta}`; flat references (`imageId`, `categoryIds`).
- **D5 Sessions** (step 7.0, done): `/api/admin/auth/login|refresh|logout`, staff only; the refresh token in an `HttpOnly`, `SameSite=Strict` cookie scoped to `/api/admin/auth` (`Secure` in production); the access token in the app's memory; same-origin `Origin` required.
- **D6 Roles.** Editors: content, media, orders, contact messages, settings. Admins: also users, and deleting contact messages. `@Roles()` on the server; `authProvider.canAccess` only hides UI. _(Built as proposed; the user hadn't answered. Changing it is one `@Roles()` and one line in `canAccess`.)_
- **D7 Prices** stay in kopiykas in the API; the admin's money input shows and parses hryvnias exactly.
- **D8 Order status** through `POST /api/admin/orders/:id/status`, `canTransition()`, and a conditional update (one of two concurrent changes wins, 409). No create, edit or delete.
- **D9 Reordering** sections and menu items: one `PUT …/order {ids}` per list, in a transaction.
- **D10 HTML from staff is sanitized on write** (`sanitize-html` 2.18, allow-list built from the imported content and the rich-text editor's output): product descriptions and the section fields the site renders with `dangerouslySetInnerHTML` (image-banner text, video description, content, contact content and second column). Embed codes accept only `<iframe>`s over https from Google Maps, YouTube or Vimeo. Markdown fields (posts, promo, benefits) stay as written: the site's react-markdown never renders raw HTML. _(Built as proposed; the hosts list is `EMBED_HOSTS` in `common/html/sanitize.ts`.)_
- **D11** An audit log line per admin write (admin id, route, record id; never the body); admin responses `no-store`.
- **D12** `disableTelemetry` (react-admin pings marmelab.com otherwise); no external scripts or fonts; the CSP is unchanged.
- **D13** `npm run admin:create` (step 7.0, done): staff accounts from the command line; the password from a hidden prompt or `--password-stdin`, never argv or env.
- **D14 Section editor:** a react-admin form per section type (with image pickers, ordered product and image lists, the rich-text editor for HTML fields), plus "Edit as JSON"; the server's `validateSectionData()` decides, its errors show next to the field. Puck was not tried: its point is a visual preview, which needs the site's React components, and those live in the Next.js app; without them it would be a form builder like this one, with a pre-1.0 API.
- **D15 Tests:** API e2e for every admin endpoint; Vitest for the app's providers, money and section helpers; a browser smoke script (`admin/scripts/smoke.mjs`, puppeteer-core, run by hand against a throwaway database).
- **Dashboard:** orders by status, today's and this week's orders, unhandled contact messages, the newest orders.

## Data migration (`src/strapi-import/`, `npm run import:strapi`)

A one-off import, compiled with the app (it uses the entities) and run from `dist/` like the migration scripts. It reads `backend/.tmp/data.db` with Node's built-in `node:sqlite` (no native dependency) and writes through the TypeORM DataSource in **one transaction**, compared with the source before it commits. `--dry-run` rolls back; it refuses a database that has data unless `--replace` empties the imported tables. Usage: README, "Importing the Strapi data".

- **Drafts.** Strapi 5 stores a draft and a published row per document. Take rows with `published_at IS NOT NULL` (exactly one per document in this database). Relations may point at either row: they are resolved through `document_id`.
- **Media.** All 79 `files` rows become `Media` with the same `/uploads/<hash>.jpg` URLs; the 219 files (originals and Strapi's sizes, which match ours) are copied into `UPLOADS_DIR` as they are, nothing reprocessed. `size`: kilobytes → bytes; `formats`: url, width, height; `folder` from the upload folder's name (`Products` → `products`). **`alternative_text` is the file name on all 75 files that have one** (Strapi's default): imported as no alt text. Only the `image` field of products is read: the 28 `Image` links are Strapi 4 leftovers.
- **Users.** The bcrypt hashes are copied as they are, so passwords keep working (upgraded to cost 12 at the next login). All 4 are customers. **Not marked verified:** Strapi had `email_confirmation` off, so it set `confirmed` on every account without checking anything. Create the admin user separately: `npm run admin:create` (phase 7).
- **Dynamic zones.** `pages_cmps` (`body`) and `homepages_cmps` (`Body`) in `order`; each component becomes a `PageSection` through `validateSectionData()`, with relations and media as the new ids; selected products keep their link order. The homepage is the page with slug `home`.
- **Menus.** Only the fields in the current schema. The published dropdown also has 6 items under an old `MenuListItem` field, which Strapi no longer shows (two link to pages that don't exist): left out.
- **Orders.** `dishes` → `legacyDishesText`, with no items; `amount` (hryvnias) → `subtotal` in kopiykas; all `delivery` (Strapi stored no shipping method; one without an address would become `pickup`); numbered afresh by date.
- **Checks** (before commit): per-entity counts, products with an image, product-category links, every page's section types and order, menu items, the sum of order totals. A difference stops the import and saves nothing.
- **Real data** (2026-11-10): 79 media, 14 categories, 41 products (all with an image), 1 blog category, 2 posts, settings, 10 + 5 + 8 menu items, 10 pages with 42 sections, 4 users, 7 orders, 4 contact messages. No warnings.

## Frontend changes (`frontend/`, phase 8)

Surveyed 2026-11-16 against the frontend's `main` (Next 16.2, React 19, react-query 5, zustand 5, formik/yup, Jest 30).

**How it works today:**

- **API calls:**
  - `fetchAPI` (public, `qs`-built Strapi queries) and `fetchWithAuth` (bearer, one retry after a refresh) call Strapi directly from the browser and from server components.
  - Only login, register, refresh, logout and contact go through Next route handlers in `app/api/`.
- **Session and data in localStorage:** the access token, the whole user profile (email, phone, address) and the cart are kept in localStorage through zustand `persist`. The refresh token sits in a `refresh_token` cookie with `path=/`.
- **Image URLs:** 13 components build them as `process.env.API_URL + image.url`.
- **Prices:** whole hryvnias, numeric ids.
- **Where data is loaded:** pages prefetch their data in server components (`HydrationBoundary`) and render on the client. Unknown pages call `notFound()` from a client component, so they return 200, not 404.

### Decisions (confirmed by the user 2026-11-16)

- **F1 Who calls what.** The browser calls the API directly (CORS: `CORS_ORIGINS`) for public reads and every bearer call. Only the endpoints that issue or take a **refresh token** (login, register, refresh, logout, change-password) go through Next route handlers, so the token never reaches JavaScript. Server components call the API directly (`API_URL`).
- **F2 Session state in memory.** Keep the access token and the user profile in memory, not localStorage. On load the app restores the session with one `POST /api/auth/refresh` (route handler), then `GET /users/me`. The cart stays persisted (it holds no personal data).
- **F3 Guest checkout.** The API accepts guest orders (phase 4), so `proxy.ts` stops sending guests from `/checkout` to `/account`. That guard also can't work once the cookie's path is `/api/auth`.
- **F4 Generated types.** Generate the API types with `openapi-typescript` (7.13 at the time of writing) from `/api/docs-json` into `src/shared/api/schema.ts` and commit them. Entity types then become aliases (`type Product = components['schemas']['ProductDto']`), so a renamed field breaks `tsc`, not the page.
- **F5 Contact form direct.** It posts straight to `POST /api/contact`, and `app/api/contact/route.ts` is deleted. The API validates and rate-limits by the real client IP; the Next handler only duplicated that.
- **F6 Email is the only unique field** (user's decision). Usernames stop being unique, so two customers named "Олена" can both register. Login is **by email only**: "email or username" worked only because usernames were unique and had no `@`. This is an API change, step 8.1, done before the frontend steps.
- **F7 Rename `username` → `name`, 2–100 characters.** Without uniqueness and login it's just the person's name. Checkout already calls it `name`, and 100 matches the order's name limit, so a profile name always fits the checkout field. One column rename in 8.1's migration; the frontend is rewritten anyway.

### Strapi → API mapping

| Area           | Strapi (now)                                                                                                                                                                                                                                                                                                                                  | API                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Envelope       | `{data, meta: {pagination: {page, pageSize, pageCount, total}}}`                                                                                                                                                                                                                                                                              | `{data, meta: {page, pageSize, total, pageCount}}` (flat). Errors: `{error: {status, code, message, requestId, details?}}`; validation is `BAD_REQUEST` with `details: [{field, messages}]`; 429 `TOO_MANY_REQUESTS` with `Retry-After`                                                                                                                                                                 |
| Settings       | `GET /site-option?populate=*`: `SiteName`, `SEO.seo_title/seo_description`                                                                                                                                                                                                                                                                    | `GET /settings`: `siteName`, `seo.title/description/shareImage` (a media object: fixes the dead OG-image path)                                                                                                                                                                                                                                                                                          |
| Menus          | `/header-menu` `data.menuItem`, `/footer-menu` `data.footerMenu`, `/dropdown-menu` `data.menuItem` + `data.menuListItem`; items `{id, Title, Link, Classname}`                                                                                                                                                                                | `GET /menus/header\|footer\|dropdown`: `data.items[{id, title, link, className, group}]`; the dropdown's `group: main` is the old `menuItem`, `list` the old `menuListItem`                                                                                                                                                                                                                             |
| Homepage       | `GET /homepage`: `data.Body`                                                                                                                                                                                                                                                                                                                  | `GET /pages/home`: `data.sections`                                                                                                                                                                                                                                                                                                                                                                      |
| Pages          | `GET /pages?filters[slug]=`: `data[0].body`                                                                                                                                                                                                                                                                                                   | `GET /pages/:slug`: `data.sections`, `data.seo`; **404** for unknown, draft or scheduled pages                                                                                                                                                                                                                                                                                                          |
| Section type   | `__component: 'sections.<name>'`                                                                                                                                                                                                                                                                                                              | `type`: `image-banner`, `products`, `benefits`, `articles`, `image-gallery`, `video` (was `video-block`), `news` (was `news-section`), `content`, `contact`, `promo` (was `promo-block`); each section has an `id`                                                                                                                                                                                      |
| Section fields | `background_color`, `Benefit` / `article`, gallery `Title`, `embed_video_url`, `placeholder_image`, `blog_category.Name`, `embed_code`, `content2`, `form`, `form_title`, `map_embed_code`, `invert_layout`, `custom_ID`, `custom_Class`, `product_category.products`, source `Selected\|Category\|Featured\|Favorite`, layout `Slider\|Grid` | `backgroundColor`, `items` (no `id`: key by index), `title`, `videoUrl`, `placeholderImage`, `blogCategory {id, name, slug}`, `embedCode`, `secondaryContent`, `showForm`, `formTitle`, `mapEmbedCode`, `invertLayout`, `anchorId`, `className`, **`products[]` resolved by the server** (available products only, in order), source and layout lower-case; `content` sections may also have an `image` |
| Media          | `{id: number, url, width, height, formats, alternativeText}`                                                                                                                                                                                                                                                                                  | `{id: uuid, url, alt \| null, width \| null, height \| null, formats \| null}`                                                                                                                                                                                                                                                                                                                          |
| Products       | `GET /products?populate=*` (silently capped at 25), price in hryvnias, numeric id                                                                                                                                                                                                                                                             | Embedded in `products` sections; standalone `GET /products?category=&featured=&favorite=&page=&pageSize=` (≤ 100). **Price: integer kopiykas**; id: UUID; `categories[]`                                                                                                                                                                                                                                |
| Blog list      | `GET /blog-posts?filters[$and][0][blog_categories][Name][$eq]=…`: `Title`, `Text`, `Image`                                                                                                                                                                                                                                                    | `GET /blog-posts?category=<slug>&page=&pageSize=`: `title`, **`excerpt`** (no full text), `image`, `publishedAt`, `categories`                                                                                                                                                                                                                                                                          |
| Blog post      | `GET /blog-posts?filters[slug]=`: `data[0]`                                                                                                                                                                                                                                                                                                   | `GET /blog-posts/:slug`: `data` with `text` (markdown), `seo`; 404 for drafts                                                                                                                                                                                                                                                                                                                           |
| Auth           | `/auth/local {identifier, password}` → `{jwt, refreshToken, user}`; `/auth/local/register`; `/auth/refresh-token`                                                                                                                                                                                                                             | `/auth/login {email, password}` (email only, F6), `/auth/register` (201) → `{accessToken, expiresIn, refreshToken, refreshTokenExpiresAt, user}`; `/auth/refresh {refreshToken}` → a new pair (the old token is used up); `/auth/logout {refreshToken}` (204)                                                                                                                                           |
| User           | `{id: number, confirmed, blocked, provider, updatedAt, …}`                                                                                                                                                                                                                                                                                    | `{id: uuid, name, email, emailVerified, phone, address, role, createdAt}` (F7)                                                                                                                                                                                                                                                                                                                          |
| Profile        | `PUT /users/:id` (password in the same body)                                                                                                                                                                                                                                                                                                  | `PATCH /users/me` (`currentPassword` required to change the email); the password through `POST /auth/change-password {currentPassword, newPassword}` (min 8)                                                                                                                                                                                                                                            |
| Orders         | `POST /orders {data: {dishes, amount, users_permissions_user, …}}`                                                                                                                                                                                                                                                                            | `POST /orders {items: [{productId, quantity}], name, email, phone, shippingMethod: delivery\|pickup, address?, comments?}` → `data.number`, `data.subtotal`; `GET /orders/me`                                                                                                                                                                                                                           |
| Contact        | `POST /contact-submissions {data: {…}}`                                                                                                                                                                                                                                                                                                       | `POST /contact {name (≤ 100), email, message (≤ 5000), website}` → 204                                                                                                                                                                                                                                                                                                                                  |

### Steps

**8.0 Preparation**

- **Line endings.** The frontend's working tree shows 252 modified files, all line endings only (CRLF; `git diff --ignore-cr-at-eol` is empty). Restore them (`git checkout -- .`), or add `.gitattributes` (`* text=auto eol=lf`) and renormalise, before branching; otherwise every diff is noise.
- **Branch.** Create `feature/nest-api` from `main`. `dev`, `tests` and `feature/auth-tokens-rotation` are already merged into it.
- **Local stack.** The API on :1339 with the imported data and Mailpit. `api/.env` needs `CORS_ORIGINS=http://localhost:3000` and `FRONTEND_URL=http://localhost:3000` (both are the defaults in `.env.example`).
- **Frontend env.**
  - Point `DEV_API_URL` and `NEXT_PUBLIC_API_URL` at `http://localhost:1339`.
  - Add a `.env.example` (there is none).
  - Drop `DEV_DOMAIN`, `PROD_DOMAIN` and `SKIP_BUILD_STATIC_GENERATION`: nothing reads them.
- **`next.config.ts` `remotePatterns`:** replace `localhost:1338` with `localhost:1339`. Keep the production host; image URLs stay `API_URL + media.url`.
- **Done when:** the site starts against the new API (still broken) and `git status` is clean apart from intended changes.

**8.1 API: email-only accounts (F6, F7)**, in `api/`. First, because the generated types (8.2) come from it.

- **Migration:**
  - Drop `UQ_user_username`.
  - Replace `CHK_app_user_username` with `CHK_app_user_name`: length only (2–100, no control characters). The "no `@`" rule existed only to keep "email or username" login unambiguous.
  - F7: rename the column to `name`, as `text` (case-insensitive comparison no longer matters), and widen it to 100 characters.
  - `down` restores the unique constraint. That fails once two accounts share a name: let it fail with a clear message rather than rename people.
- **Entity and DTOs:**
  - `User`: no `@Unique`, the new `@Check`, comments updated.
  - `UserFieldsDto`: `name` (F7), 2–100 characters, any script, spaces and `@` allowed, no control characters.
  - `UserDto`, `AdminUserDto`, the mappers, `RegisterDto`, `UpdateMeDto`.
- **Login by email:**
  - `LoginDto.identifier` → `email` (≤ 254, checked only for an `@` like the database's check, not with `IsEmail`: an imported account with an unusual address must still get in) on `/auth/login` and `/admin/auth/login`.
  - `UsersService.findByIdentifierWithPassword` → `findByEmailWithPassword`.
  - `@ThrottleBy('email')`.
  - `INVALID_CREDENTIALS` reads "Invalid email or password".
  - Swagger texts updated.
- **Conflicts:**
  - Remove the `USERNAME_TAKEN` mapping. Register and `PATCH /users/me` answer 409 only with `EMAIL_TAKEN`.
  - Update the 409 descriptions in `auth.controller` and `users.controller`.
- **Admin app and CLI:**
  - The admin app's sign-in page is react-admin's built-in `LoginWithEmail`; `authProvider.login` sends `{email, password}`.
  - Users list and edit: `name` (F7); search stays name or email.
  - `npm run admin:create -- --email … --name …`.
  - The smoke script's users column.
- **Strapi import:** names are copied as before.
  - The 4 imported customers could sign in with their username on Strapi; after cutover only with their email.
  - The site's sign-in form says "email" (8.8).
- **Tests:**
  - e2e: two accounts with the same name (also differing only in case) register; logging in with a name instead of an email is a 400; the `USERNAME_TAKEN` tests go; the admin login uses `email`.
  - The migration's up and down run in CI's schema check.
  - Unit tests for the DTO rules.
- **Plan and README:** the data model row, the public API's login line and rate limits ("per IP + email"), the README's auth notes.
- **Done when:** the API's format, typecheck, lint, build, unit and e2e tests and the admin smoke test pass, and `/api/docs-json` shows `name` and `email`-only login.

**8.2 API layer (`src/shared/api/`)**

- **`schema.ts`:** generated (F4), with an `npm run api:types` script that reads `http://localhost:1339/api/docs-json`.
- **`client.ts`:**
  - `apiUrl(path)`: the existing server/browser split, `API_URL` vs `NEXT_PUBLIC_API_URL`.
  - `apiFetch<T>(path, {query, ...init})`: `URLSearchParams` instead of `qs` (remove `qs` and `@types/qs`). It unwraps `{data, meta}` and throws an `ApiError {status, code, message, details, retryAfter}` built from the error envelope; network failures become status 0.
  - Replaces `fetchAPI` and `getStrapiURL`.
- **`errors.ts`:** one place that turns codes into Ukrainian messages:
  - `INVALID_CREDENTIALS`, `ACCOUNT_BLOCKED`
  - `EMAIL_TAKEN`
  - `WRONG_PASSWORD`, `CURRENT_PASSWORD_REQUIRED`
  - `INVALID_TOKEN`, `PRODUCTS_UNAVAILABLE`
  - 429 with the wait from `Retry-After`

  Also a `fieldErrors(error)` helper for Formik's `setErrors` from `details`. The API's own messages are English; show your text, keyed by field and code.

- **`src/shared/lib/media.ts`:**
  - `mediaSrc(media, format?)`: the URL, optionally a `formats.medium` etc. variant.
  - `mediaProps(media)`: `src`, `alt ?? ""`, and width/height with a fallback (they're nullable) for `next/image`.

  Replaces `getStrapiMedia` and the 13 `process.env.API_URL + …` call sites. Use the existing (unused) `prefixContentImages` on HTML fields: product description, image-banner text, video description, content, contact. Images the admin's editor inserts are `/uploads/…`.

- **`src/shared/lib/money.ts`:** `formatPrice(kopiykas)`, e.g. `85 ₴` / `85,50 ₴` (`Intl.NumberFormat('uk-UA')`). Prices are integers everywhere in code; divide only for display.
- **Server-side getters** (settings, page, post): wrap them in React `cache()`, so `generateMetadata` and the page share one request.
- **Done when:** unit tests cover `apiFetch` (envelope, error envelope, query building, network error), `formatPrice` and `mediaSrc`.

**8.3 Settings, menus and the layout**

- **`entities/Options`:** `GET /settings`. Rename `SiteOptions` (`siteName`, `seo`); update `defaultSiteOptions` in `shared/constants`.
- **`entities/Menu`:** one `menuApi.get(key)`; the dropdown splits `items` by `group`. Default menus use the new field names. Touch points:
  - `Navbar`, `NavbarCollapseMenu`, `NavbarCollapseDropdownMenu`
  - `Footer`, `FooterNav`, `FooterWidget`
  - `NavbarTel`, `NavbarCenter`
- **Done when:** header, dropdown and footer show the admin's menus and settings (change one in the admin and reload).

**8.4 Pages, sections and SEO**

- **`entities/PageData`:** one `getPage(slug)` (`/pages/:slug`); the homepage is `home`. Remove the "single type vs dynamic type" split (`isPageDynamic`).
- **Real 404s:** in `pages/home` and `pages/subpage`, fetch on the server with `queryClient.fetchQuery` and call `notFound()` there on `ApiError` 404. That way unknown pages answer 404, not 200.
- **Remove the products prefetch:** `Subpage` no longer prefetches `productsQuery()`; sections arrive with their products.
- **`SectionWizard`:** switch on `type`, `key={section.id}`, pass the renamed fields (table above). A section with a type it doesn't know renders nothing.
- **Widgets:** take the new field names and `mediaProps()`. Item lists (benefits, articles) are keyed by index. `ContentBlock` may show the new `image`. Touch points:
  - `ImageBanner`, `ProductList`, `BenefitsList`, `ArticlesList`
  - `ImageGallery`, `VideoWidget`, `NewsWidget`, `ContentBlock`, `ContactUs`, `PromoBlock`
  - `BenefitPost`, `ArticlePost`
- **`ProductList`:** render `section.products` as given. The client-side filtering by source and availability, and the `rawProducts` prop, go away: the server resolves featured, favorite, category and selected, available products only. This also fixes the cap of 25 products.
- **`ProductCard`:** `calories` (fixes the `callories` mismatch), `formatPrice`, the description through `prefixContentImages`.
- **`PageSEO`:**
  - It reads `page.seo` with `settings.seo` as the fallback, and `title` from `seo.title ?? page.title`.
  - The share image becomes an absolute URL in `openGraph.images`.
  - A 404 calls `notFound()`.
- **Done when:** the homepage and all 9 CMS pages render like on Strapi (compare side by side: section order, images, product lists per source, gallery, video, map embed, contact form). An unknown slug is a 404; the page `<title>` and description come from the admin's SEO fields.

**8.5 Blog**

- **`entities/BlogData`:** `getPosts({category: slug, page, pageSize})`. `NewsWidget` uses `blogCategory.slug` (hidden when the category is null). `Pagination` gets the flat `meta`.
- **`BlogPost`:** shows `excerpt` (drop the client truncation of the full text) and the image's `formats.medium`.
- **`entities/PostData`:** `getPost(slug)` (`/blog-posts/:slug`). `PostDetails` renders `title`, `image`, `text` (markdown), and gives `notFound()` on 404 on the server like 8.4.
- **News post SEO:** `app/(main)/news/[slug]/page.tsx`'s `generateMetadata` uses the post's `seo` (falling back to its title and excerpt). This fixes the old bug of querying `/pages` for a post.
- **Done when:** the news section pages through both posts, a post opens with its SEO, and a draft post's URL is a 404.

**8.6 Prices and the cart**

- **Cart store** (`entities/Cart`): ids become strings (UUIDs) and prices integer kopiykas. Store `{productId, title, image, unitPrice, quantity}`; `totalAmount` is the sum in kopiykas.
- **Old carts:** give the cart's `persist` a `version: 1` and a `migrate` that empties carts saved by the Strapi site. Their numeric ids and hryvnia prices are meaningless to the new API.
- **Display:** `formatPrice` in `ProductCard`, `ShopCartItem`, `ShopCart`, `NavbarCollapseCart` and `NavbarDropdownCart`. The cart's totals are an estimate; the order's `subtotal` from the API is the real price.
- **Done when:** adding, removing and totals work, and a cart saved by the old site is emptied, not sent.

**8.7 Sessions (auth)**

- **Route handlers** in `app/api/auth/`:
  - `login` and `register` call `/api/auth/login` and `/api/auth/register`.
  - **Every handler that receives tokens** sets the refresh token as a cookie and returns only `{accessToken, expiresIn, user}`.
  - `refresh` sends the cookie's token and **stores the new one** (the old one is used up).
  - `logout` sends the refresh token to `/api/auth/logout` (the session ends on the server), then clears the cookie.
  - A new `change-password` handler (it returns a new pair, see 8.8).
  - All of them forward the client's `X-Forwarded-For`, appending to what nginx sent; `NextRequest` has no `ip` in Next 16. Otherwise the API's per-IP limits count the whole site as one client.
- **Cookie:**
  - Rename it `sf_refresh`: `HttpOnly`, `SameSite=Strict`, `Secure` in production, `path=/api/auth`, `expires` = `refreshTokenExpiresAt`.
  - Delete the legacy `refresh_token` (`path=/`) on login, refresh and logout. Two cookies with the same name and different paths would otherwise both be sent.
- **Token in memory (F2):**
  - The `auth` store loses `persist`; `user-storage` and `token-storage` are removed from localStorage once at startup.
  - A session bootstrap on app load: refresh, then `GET /users/me`. It shows "logged out" on a 401.
  - The account page waits for the bootstrap instead of reading a persisted user.
- **`fetchWithAuth`:**
  - **One shared refresh promise** per tab (concurrent 401s wait for it).
  - **A cross-tab lock** (`navigator.locks.request('sf-refresh', …)`). The API answers a token reused within 10 s with a 401 without ending the session, but the refresh handler would then delete the cookie that the other tab just renewed.
  - It retries once with the new token, signs out on a failed refresh, and throws `ApiError`.
- **`proxy.ts`:** remove the `/checkout` guard (F3). Nothing else is protected server-side; account pages handle "logged out" themselves.
- **Done when:**
  - Login, register, logout and reload keep or end the session correctly.
  - Logging out ends the server session (a later refresh with that token fails).
  - Ten parallel calls with an expired access token trigger one refresh.
  - Two tabs refreshing at once stay logged in.
  - No token or profile data remains in localStorage.

**8.8 Account**

- **`SignIn`:** one **email** field (`type=email`, ≤ 254; today a "username or email" field capped at 30, so a long email can't log in). Customers who used their username on Strapi now sign in by email: say so under the field. Password min 8, max 72 bytes. Show `INVALID_CREDENTIALS` and `ACCOUNT_BLOCKED`, and the 429 wait.
- **`SignUp`:** `name` (2–100 characters, not unique: F6, F7), phone in the API's format (`+`, digits, spaces, brackets, dashes; 7–20 characters), password min 8. `EMAIL_TAKEN` shows on the email field.
- **`UserInfoForm`:**
  - `PATCH /users/me` with only the changed fields.
  - A "current password" field appears when the email changes (`CURRENT_PASSWORD_REQUIRED`, `WRONG_PASSWORD`).
  - The password fields move to a **separate change-password form** (current + new + confirmation). It goes through the new route handler, which stores the new refresh cookie: the API ends every other session.
- **Email verification:** show `emailVerified`, with a "resend the link" button (`POST /auth/resend-verification`, 3/hour).
- **Order history:** a list on the account page from `GET /orders/me` (paginated): number, date, status, items, subtotal. Legacy orders show `legacyItemsText`.
- **Done when:** every form shows the API's errors on the right field, and an email change sends the verification link and the notice (check Mailpit).

**8.9 Password reset and email verification**

- **Forgot password:** finish the placeholder modal `ModalResetPassword` and re-enable the commented-out "Забули ваш пароль?" link. It sends `POST /auth/forgot-password {email}` (always 204: show the same "check your email" text whether or not the account exists).
- **Two new pages:** `app/(main)/reset-password/page.tsx` and `verify-email/page.tsx`.
  - They read the token from `location.hash` (`#token=…`), clear the fragment (`history.replaceState`) and post it: `/auth/reset-password {token, newPassword}`, `/auth/verify-email {token}`.
  - Show success, or `INVALID_TOKEN` with a way to ask for a new link.
  - `metadata.referrer = 'no-referrer'` and `robots: noindex`.
  - A reset doesn't log in: send the user to sign in. Verification refreshes the profile if a session exists.
- **Remove the old `resetPassword`** in `features/Auth/api` (it called Strapi without the code and never worked).
- **Done when:** a reset link from Mailpit works once, a second use shows the error, and verification flips `emailVerified`.

**8.10 Checkout**

- **`features/Order/placeOrder`:** sends `items[]` from the cart (`productId`, `quantity`), `name`, `email`, `phone`, `shippingMethod`, and `address` only for delivery, plus `comments`. Bearer when logged in, none for guests (`fetchWithAuth` must not demand a token).
- **`CheckoutForm`:**
  - An **email field** (required; pre-filled and editable for logged-in users).
  - Shipping `flat_rate` → `delivery`, `local_pickup` → `pickup`. Pickup sends **no** address; today it sends the shop's address as the customer's. The shop's address is shown, not submitted.
  - Limits match the API: name ≤ 100, address ≤ 500, comments ≤ 1000, the phone pattern.
- **Errors:**
  - **409 `PRODUCTS_UNAVAILABLE`:** name the lines from `details` and offer to remove them from the cart.
  - **400:** field errors.
  - **429:** the wait.
  - Otherwise: the existing "call us" message.
- **Success:** the screen shows the **order number** (`data.number`) and the server's `subtotal`; the cart is emptied only after a 201.
- **Done when:** guest and logged-in orders appear in the admin with their items and the server's prices; both emails arrive in Mailpit; an order with a product made unavailable in the admin shows the 409 message.

**8.11 Contact form**

- **Posting:** `ContactForm` posts `{name, email, message, website: ""}` to `POST /api/contact` directly (F5) and gets a 204. The hidden `website` input is visually hidden but not `display:none`, with `tabIndex=-1` and `autoComplete="off"`.
- **Clean-up:** delete `app/api/contact/route.ts`.
- **Errors and limits:** name ≤ 100, message ≤ 5000; show the 429 wait.
- **Done when:** a message appears in the admin's messages, and the shop's email arrives in Mailpit with `Reply-To` set to the sender.

**8.12 Clean-up**

- **Remove dead code and old names:**
  - `getStrapiURL`, `getStrapiMedia`, `fetchAPI`, `qs`
  - `RefreshResponse.jwt`, the old `Order` type with `dishes`/`amount`
  - Strapi wording in comments
- **Dependency:** `entities/Product` keeps only what's used (sections embed their products).
- **Small fixes along the way:**
  - `<html lang="ru">` → `"uk"`
  - `next/head` in the App Router root layout does nothing: the favicon comes from `app/favicon.ico`.
- **CI** (`.github/workflows/deploy.yml`): Node 24 (as the API), add `npm run lint` and `tsc --noEmit` next to the tests.
- **Not here:** the deploy steps change in phase 9 (cutover).

**8.13 Tests and verification**

- **Rewrite the Jest tests** in `src/features/**` (8 files, all mock Strapi payloads): auth API and hooks, `fetchWithAuth` (single refresh, cross-tab lock mocked, sign-out on failure), place order (payload shape, guest without token, 409), contact.
- **Add tests** for the route handlers (cookie name, path and expiry; the refresh token never in the body; `X-Forwarded-For` passed on), the cart migration, `formatPrice`, `mediaSrc` and `fieldErrors`.
- **Manual run** against the local API:
  - the homepage, all 9 CMS pages and an unknown slug (404)
  - the news list and a post
  - register, verify email, log in, edit the profile, change the password, forgot/reset, log out
  - guest and logged-in checkout (check the admin and Mailpit)
  - the contact form
  - two tabs over an access-token expiry
  - a cart saved by the old site
  - Lighthouse SEO tags on a page and a post
- **Done when:** lint, `tsc`, Jest and `next build` pass, and the manual list is clean, with no console errors.

**Not in phase 8:** product pages; online payment; a delivery fee; caching pages (`revalidate` with a revalidation call from the admin on save); a sitemap; Next 16.2 → 16.4; Ukrainian texts in the admin (phase 7 carry-over).

## Cutover (phase 9)

**Production today** (from the deploy workflows, 2026-11-17):

- **Hosting:** one VPS with a hosting panel's layout (`/home/dev/web/<domain>/public_html`). nginx in front, with TLS for both domains.
- **Strapi:** runs under pm2 (`simplefood-backend`, port 1338) at `api-simplefood.kozyr.info`, on SQLite `.tmp/data.db` with uploads in `public/uploads`. GitHub Actions deploys it by `git pull` and `npm ci`.
- **Website:** Next's standalone server under pm2 (`simplefood-frontend`) at `simplefood.kozyr.info`, built on the VPS by its deploy workflow.
- **Docker:** the backend's Docker files were an experiment; nothing on the VPS uses them.

**The goal:** the same two domains, with Postgres and the Nest API (and its admin at `/admin`) instead of Strapi, and the website from `feature/nest-api`. Customers keep their passwords and order history. Staff move to the new admin. Strapi stays switchable-back for two weeks.

### Decisions (proposed; confirm before 9.1)

- **C1 Postgres and the API in Docker Compose** on the VPS (the plan since phase 1): one image, the same on every host, with migrations and the import run from it.
  - **Needs:** Docker Engine on the VPS (9.0 checks).
  - **Alternative:** Postgres from the OS packages and the API under pm2, like today.
- **C2 The website stays on pm2**, as today. It moves to Node 24 and listens on `127.0.0.1` only: its session routes pass `X-Forwarded-For` on, so it must be reachable only through nginx.
- **C3 Images built in CI and published to GHCR**, tagged with the commit SHA, so the VPS pulls a tested image and a rollback is a tag. The alternative is building on the VPS.
- **C4 A transactional mail provider** for `MAIL_FROM` on the shop's domain: Brevo, Mailgun, Postmark or Amazon SES, **your choice** (an account is needed). It needs SPF, DKIM and DMARC records, or mail lands in spam.
- **C5 Off-site backups:**
  - nightly `pg_dump` plus the uploads, to storage outside the VPS (an S3-compatible bucket or a storage box, **your choice**);
  - kept 14 days daily and 8 weeks weekly;
  - a restore test each month.
- **C6 The window:** a quiet evening, about 30–45 minutes, with a maintenance page on the site (the shop's phone number on it). The rehearsal (9.6) sizes it.
- **C7 Rehearsal over SSH tunnels**, with no new subdomain or certificate: the rehearsal API and site run on other ports of the VPS and are opened through tunnels.

### Steps

**9.0 Inventory (read-only, on the VPS)**

- **The machine:** OS, CPU architecture (`uname -m`), RAM and disk space. Is Docker installed? Which hosting panel manages nginx?
- **nginx:** the vhosts of both domains (where they proxy, `client_max_body_size`, headers), and the TLS certificates (renewal).
- **Processes:** `pm2 ls`, and the Node versions (nvm) used by each process.
- **Data:** the size of `data.db` and `public/uploads`.
- **Firewall:** only 22, 80 and 443 open; 1338, 3000 and 5432 not reachable from outside.
- **Phase 0:** check that Strapi's public role can no longer read orders and users. It matters until the switch.
- **Done when:** a short note in this plan with the facts above, and C1–C7 confirmed.

**9.1 The production image** (from phase 1; `.dockerignore` is already an allow-list)

- **`Dockerfile`, 3 stages on `node:24-alpine`:**
  - `build`: `npm ci`, `nest build` (so the Swagger plugin runs), and the admin app (`npm ci && npm run build` in `admin/`, with `VITE_SITE_URL=https://simplefood.kozyr.info` for its "Open on the site" links);
  - `deps`: `npm ci --omit=dev`;
  - `runtime`.

  Use npm cache mounts and bind-mounted `package*.json`. If `sharp` has trouble on Alpine's musl, switch to `bookworm-slim`. Add `admin/` to the `.dockerignore` allow-list, without `admin/node_modules` and `admin/dist`.

- **Runtime stage:**
  - `NODE_ENV=production`, `NODE_OPTIONS=--enable-source-maps`.
  - Copy `dist/`, the production `node_modules`, `admin/dist` (at `ADMIN_DIST_DIR`) and **`package.json`** (the Swagger version reads it) with `--chown=node:node`, then `USER node` and `EXPOSE 1339`.
  - `CMD ["node", "dist/main.js"]` in exec form, never `npm start`, so SIGTERM reaches Node and the shutdown hooks run. Run with `init: true`.
- **Health check:** `src/healthcheck.ts` `fetch`es `/health` with a 2 s timeout and exits 0 or 1 (Alpine has no curl): `HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=2s --retries=3 CMD ["node", "dist/healthcheck.js"]`.
- **Migrations:** a `migration:run:prod` script (`typeorm migration:run -d dist/database/data-source.js`, no build), run as a one-off container from the same image before a new version starts.
- **Architecture:** build `linux/amd64` in CI (Apple Silicon builds `arm64` by default); match the VPS's `uname -m`.
- **CI:**
  - a `docker` job builds the image, starts it next to a Postgres container, waits for `healthy` and checks `/health` and `/admin/`;
  - the deploy workflow publishes it to GHCR as `ghcr.io/<owner>/simplefood-api:<sha>` (C3).
- **Done when:**
  - the image is under about 250 MB, with no dev tools, sources or `.env`;
  - it runs as `uid=1000(node)`, refuses to start with bad config, turns healthy and writes JSON logs;
  - `docker stop` takes about a second;
  - migrations run from it, and stack traces point to `src/*.ts`.

  Also look at `docker scout cves`.

**9.2 Production Compose and configuration** (`deploy/docker-compose.prod.yml` in the api repo, plus a documented `.env.production` template)

- **`postgres`:** `postgres:18`, a named volume, no published port (or `127.0.0.1` only), a `pg_isready` health check, `restart: unless-stopped`.
- **`api`:**
  - the GHCR image by SHA; `ports: ["127.0.0.1:1339:1339"]`; a named volume for `UPLOADS_DIR` (owned by `node`);
  - `init: true`, `restart: unless-stopped`, `depends_on` Postgres healthy;
  - log rotation (`json-file`, `max-size: 10m`, `max-file: 5`).
- **One-off commands from the same image:**
  - migrations;
  - the import (9.7);
  - `node dist/users/cli/create-admin.js --email … --name …` for staff (`docker compose run --rm -it api …`).
- **`.env.production`** (on the VPS only, `chmod 600`, never in git):
  - `NODE_ENV=production`, `SWAGGER_ENABLED=false`, `LOG_LEVEL=info`;
  - `DB_*` with a generated password;
  - `JWT_ACCESS_SECRET` from `openssl rand -base64 48`;
  - `CORS_ORIGINS` and `FRONTEND_URL` both `https://simplefood.kozyr.info`;
  - `TRUST_PROXY_HOPS=1` (nginx, see 9.3);
  - the `SMTP_*` settings, `MAIL_FROM` and `MAIL_NOTIFY_TO` (the shop's inbox).
- **Rate limits:** the counters live in memory, per process. That's fine for one instance; switch the throttler to Redis before running more.
- **Done when:** `docker compose up` on the VPS starts Postgres and the API on an empty database (migrations applied), and `/health` answers on `127.0.0.1:1339`.

**9.3 nginx for the API** (written now, switched on in 9.7)

- **Proxy:** `api-simplefood.kozyr.info` proxies to `127.0.0.1:1339` with:
  - `proxy_set_header Host $host` (or the admin's sign-in refuses every request: `CROSS_ORIGIN_REQUEST`);
  - `X-Forwarded-For $proxy_add_x_forwarded_for` and `X-Forwarded-Proto $scheme`;
  - `client_max_body_size 11m` (uploads go up to 10 MB).
- **`TRUST_PROXY_HOPS=1`** then gives the API the client's address, for requests through nginx and for the website's server calls alike. That requires the website to call the API at `127.0.0.1:1339` (9.5), not through nginx.
- **Optional:** nginx serves `/uploads` directly from the volume, with the API's headers (immutable cache, `Cross-Origin-Resource-Policy: cross-origin`, `nosniff`).
- **Done when:** the new vhost config is tested (`nginx -t`) and kept beside the current one, ready to swap.

**9.4 Mail** (C4)

- **Setup:** the provider account; the SPF, DKIM and DMARC records for the `MAIL_FROM` domain; the `SMTP_*` settings. `requireTLS` is on in production unless `SMTP_SECURE`.
- **Done when:** a password-reset email from the rehearsal (9.6) reaches a real inbox (Gmail) with SPF and DKIM passing and not in spam, and its link opens `https://simplefood.kozyr.info/reset-password`.

**9.5 Website release** (prepared now, deployed in 9.7)

- **The VPS's `frontend/.env`:**
  - `PROD_API_URL=http://127.0.0.1:1339`: the server's calls go straight to the API, so the forwarded client address stays right (9.3);
  - `NEXT_PUBLIC_API_URL=https://api-simplefood.kozyr.info`;
  - drop the old Strapi values.
- **Node 24 for the website:** the deploy script runs `nvm install && nvm use` (`.nvmrc`). Strapi keeps its Node until it's retired.
- **pm2:** starts the standalone server with `HOSTNAME=127.0.0.1` (C2).
- **Deploy script:** it pulls `main`, so merging `feature/nest-api` into `main` is the release. Tag the current `main` as `pre-nest` first, for the rollback.
- **Done when:** the rehearsal build (9.6) with these settings works through nginx's address rules.

**9.6 Rehearsal** (C7; repeat until it runs clean)

- **Copy production's data:** `data.db` and `public/uploads` into a scratch folder on the VPS (copies; Strapi keeps running).
- **Import into a rehearsal database:**
  - in the production Compose project, a separate `simplefood_rehearsal` database;
  - migrations, then `import-strapi --dry-run`, then the real import;
  - note the counts it prints (they must equal Strapi's) and the time it took.
- **Run it:**
  - the API image on `127.0.0.1:1340` against that database, with a rehearsal uploads folder;
  - a website build on `127.0.0.1:3001` pointing at it;
  - both opened through SSH tunnels.
- **Check it:**
  - the admin smoke test (it writes data: the rehearsal database is throwaway);
  - the site's browser check from phase 8 (register, verify, sign in with an imported customer's email and their old password, order as a guest and as a customer, contact form, forgot/reset);
  - the mail check (9.4).
- **Then:** drop the rehearsal database and folders.
- **Done when:** everything passes, the timing is known, and the runbook (9.7) is adjusted.

**9.7 Cutover runbook** (C6)

1. **The day before:**
   - announce on the site and on social media;
   - check that the latest Strapi `data.db` and uploads are backed up;
   - put the website's new `.env` in place (it's only read at the next build);
   - have the staff list ready for `admin:create`.
2. **Maintenance page:** nginx answers `simplefood.kozyr.info` with a static 503 page (the shop's phone number on it).
3. **Freeze Strapi:** `pm2 stop simplefood-backend`. From here its data can't change. Archive `data.db` and `public/uploads`, with checksums.
4. **Data:**
   - `docker compose up -d postgres`, then migrations;
   - `import-strapi --dry-run` with the SQLite file and Strapi's uploads mounted read-only, then the real import into the empty production database;
   - compare the counts with the rehearsal's.
5. **API:**
   - `docker compose up -d api`; check `/health` on `127.0.0.1:1339`;
   - create the staff accounts (`admin:create --name`).
6. **Switch nginx** to the new API vhost (9.3) and reload. Check from outside:
   - `/health`, `/api/settings`, `/admin/` (sign in), an `/uploads/…` image;
   - CORS for the site's origin.
7. **Release the website:** merge `feature/nest-api` into `main`; the workflow builds and restarts it. Check the homepage, a page and a news post.
8. **Lift the maintenance page.** Then:
   - place a real test order and a contact message, check both emails arrive, and decline the order in the admin;
   - sign in with a staff account.
9. **Watch for an hour:** `docker compose logs`, pm2 logs, 5xx in nginx.

**9.8 Rollback** (if steps 4–8 fail in a way that can't be fixed in about 15 minutes, or within the 2 weeks)

1. nginx back to the old vhost (port 1338); `pm2 start simplefood-backend`. Its `data.db` is untouched, because Strapi was stopped before the import.
2. Website: deploy the `pre-nest` tag (or revert the merge); its old `.env` is kept as `.env.pre-nest`.
3. Anything created in the new system meanwhile (orders, contact messages, new accounts) is listed from the admin and re-entered by hand. Keep the Postgres volume for that.

**9.9 After the switch**

- **Backups (C5):**
  - nightly `pg_dump -Fc` plus the uploads volume, off-site, with the retention above;
  - a restore test into a scratch database each month (and once right after the switch);
  - the archived Strapi data is kept offline.
- **Monitoring:** an uptime check on `https://api-simplefood.kozyr.info/health` and the homepage; disk-space alerts; Docker's log rotation (9.2).
- **Customers:**
  - Strapi's sessions don't carry over: everyone signs in again, with the same password;
  - customers who used their username sign in with their email (the form says so);
  - password reset works now.
- **After 2 weeks:**
  - `pm2 delete simplefood-backend`;
  - remove the Strapi checkout, its deploy workflow and its vhost backup;
  - keep the final `data.db` and uploads archive offline;
  - this plan: phase 9 done.
- **Later, not part of the switch:**
  - Redis for the rate limits before a second API instance;
  - a looser per-IP login cap on top of the per-account one (password spraying);
  - keying the refresh limit by session (phase 8 carry-over).

**Phase 9 is done when:** the site and the admin run on the new stack at the same addresses; customers can sign in, order and reset passwords; emails arrive (SPF and DKIM pass); backups run and one restore was tested; monitoring is on; Strapi is stopped (and removed after 2 weeks).

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
7. **Admin.** react-admin app plus admin API (see "Admin"): sessions and `create-admin` first, then the shared admin API conventions and the app skeleton, media, catalog, blog, settings and menus, orders, contact messages, users, pages and sections (JSON first, then per-type forms), the dashboard.
   - ✅ 7.0 Done (2026-11-11): `POST /api/admin/auth/login`, `/refresh`, `/logout` (staff only, `NOT_STAFF`; refresh token in the `sf_admin_refresh` cookie; `SameOriginGuard`; same rate limits as /auth); `npm run admin:create` (create or `--promote`, hidden password prompt or `--password-stdin`). Covered by unit and Testcontainers e2e tests.
   - ✅ Done (2026-11-11): the admin API (`/api/admin/*`: products, categories, media, blog, settings, menus and items, pages and sections with one-call reordering, orders with status changes, contact messages, users, dashboard; `@AdminController()` with no-store and an audit line per write; HTML sanitizing) and the admin app (`api/admin/`, react-admin 5.15, served at `/admin`; a form per section type plus JSON; image picker and uploads; prices in hryvnias). No new tables. Covered by Testcontainers e2e tests, Vitest, and a browser smoke test against a copy of the dev database.
   - **Carried over:** drag-and-drop ordering (up/down buttons now); Ukrainian UI texts (react-admin's English for now); a browser test in CI; status emails to customers; deleting accounts (GDPR); an audit table instead of log lines; code-splitting the admin bundle (1.7 MB, 0.5 MB gzipped).
   - From phase 5: the upload field and a media picker call `MediaService` (never write files directly). A blocked editor keeps API access until the access token expires (≤ 15 min, phase 3 D3), as every account does.
   - From phase 4: order status changes go through `canTransition()`; mark contact messages handled; the dashboard shows new orders and unhandled messages.
   - From phase 3: blocking a user calls `RefreshTokensService.revokeAllForUser` (their access token still works until it expires, at most 15 min); admin-only API routes get `@Roles()`, and `ApiAuth()` should then document their 403.
8. **Frontend adaptation** on a branch (`feature/nest-api`), run against the local Nest API: steps 8.0–8.13 and decisions F1–F7 under "Frontend changes" (8.1 changes the API: email-only accounts).
   - ✅ Done (2026-11-16):
     - **API (8.1):** email-only accounts (`name`, not unique, 2–100), migration `UserNameNotUnique` (its `down()` refuses shared names); the section DTOs' docs say which fields are HTML.
     - **Site:** on the Nest API through generated types (`openapi-typescript`), `apiFetch`/`authFetch` with one shared refresh per tab and Web Locks across tabs, the session routes with the `sf_refresh` cookie, real 404s; checkout for guests and customers (order number, 409 per line); account (profile, password, email verification, order history); reset-password and verify-email pages; the contact form straight to the API.
     - **Clean-up:** the old Strapi code, `qs`, `classnames`, `yup-phone`, `autoprefixer`, the unused Tailwind config (Tailwind 4 never read it), `proxy.ts`, unused helpers; the old lint error and 16 warnings; CI on Node 24 with lint and typecheck.
     - Covered by Jest (70 tests), the API's tests, and a browser run against a copy of the dev database.
   - **Deviations:**
     - Phone numbers are checked with the API's pattern instead of `yup-phone` (Ukrainian numbers only): one rule on both sides, one heavy dependency less.
     - `content` sections' `image` is still not shown (two pages have one): the Strapi site didn't show it either.
     - Prices have no thousands separator: Node and browsers disagree on the space, and server-rendered prices must match.
   - **Carried over:**
     - **Next 16.2 → 16.4.6:** `npm audit` reports a critical advisory for 16.2 (and 30 more, mostly transitive, `npm audit fix` resolves them).
     - **Refresh limits:** every full page load of a signed-in visitor refreshes (30/min per IP at the API). Behind nginx with `TRUST_PROXY_HOPS` that's per visitor; an office of customers behind one IP could hit it. Consider keying the refresh limit by session instead.
     - The "call me back" form in the header modal still does nothing (no API for it).
9. **Cutover:** the production image, Postgres and the API on the VPS, the website release, and the switch with a rehearsal and a rollback: steps 9.0–9.9 and decisions C1–C7 under "Cutover (phase 9)".

## Verification

- **Unit tests:** order pricing (rejects tampered prices and unavailable products), section DTO validation, refresh-token rotation and reuse detection.
- **e2e:** Jest with supertest against Postgres via Testcontainers. Cover every public endpoint and the auth flow: login → 401 on expiry → refresh → retry. Cover ownership: user A cannot read or update user B's data or orders.
- **Migration check:** count assertions, plus spot-checks that every product has an image and that each page's section order and types match Strapi.
- **Frontend:** `npm test` passes. Run `npm run dev` against the local API and click through the homepage, all 9 CMS pages, a news post, register/login, account update, and checkout (verify the order and items in the admin app), plus the contact form (verify the email in a Mailpit container).
- **Admin:** log in at `/admin` with an `admin:create` account, edit a product image (variants generated), reorder menu items, edit a page section, and check the result on the site.
