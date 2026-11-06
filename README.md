# SimpleFood API

REST API for the SimpleFood shop. It replaces the legacy Strapi backend and serves the Next.js frontend.

The migration is planned in phases in [docs/backend-migration-plan.md](docs/backend-migration-plan.md).

## Stack

| Area      | Choice                                                                |
| --------- | --------------------------------------------------------------------- |
| Runtime   | Node.js 24 (`.nvmrc`)                                                 |
| Framework | NestJS 12                                                             |
| Database  | PostgreSQL 18, TypeORM 1.x, migrations only (never `synchronize`)     |
| Logging   | `nestjs-pino`: JSON in production, pretty in development, request IDs |
| Auth      | JWT access tokens (`@nestjs/jwt`), rotating refresh tokens, bcrypt    |
| Limits    | `@nestjs/throttler` on the auth routes only (no global limit)         |
| API docs  | `@nestjs/swagger` (OpenAPI 3)                                         |
| Tests     | Jest, Supertest, Testcontainers                                       |
| Quality   | TypeScript strict, oxlint, Prettier, GitHub Actions                   |

## Requirements

- **Node.js 24**: `nvm use` reads `.nvmrc`.
- **Docker**: runs the local database and Mailpit, and the e2e tests start their own throwaway Postgres.

## Getting started

```bash
nvm use
cp .env.example .env         # local settings; adjust if ports clash
docker compose up -d         # Postgres 18 (port 5433) + Mailpit
npm ci
npm run migration:run        # apply the database migrations
npm run start:dev            # http://localhost:1339
```

| URL                              | What                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| <http://localhost:1339/api>      | API (every route is under `/api`)                                  |
| <http://localhost:1339/api/docs> | Swagger UI, when `SWAGGER_ENABLED=true` (JSON at `/api/docs-json`) |
| <http://localhost:1339/health>   | Health check (outside `/api`; `503` when the database is down)     |
| <http://localhost:8025>          | Mailpit: catches every email sent in development                   |

## Configuration

The API reads these variables. They are validated at startup in [src/config/env.validation.ts](src/config/env.validation.ts), and the app refuses to start if one is missing or invalid. Real environment variables take precedence over `.env`.

| Variable                                       | Required | Default        | Purpose                                                                          |
| ---------------------------------------------- | -------- | -------------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`                                     | **yes**  |                | `development`, `production` or `test`                                            |
| `PORT`                                         | no       | `1339`         | HTTP port (`1338` is the legacy Strapi API)                                      |
| `LOG_LEVEL`                                    | no       | per `NODE_ENV` | pino level; `test` = `silent`, `development` = `debug`, `production` = `info`    |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | **yes**  |                | PostgreSQL connection                                                            |
| `DB_PORT`                                      | no       | `5432`         | PostgreSQL port (`5433` locally, see `.env.example`)                             |
| `CORS_ORIGINS`                                 | **yes**  |                | Comma-separated list of allowed browser origins                                  |
| `SWAGGER_ENABLED`                              | no       | `false`        | Serve the API docs. Keep it off in production.                                   |
| `JWT_ACCESS_SECRET`                            | **yes**  |                | Signs access tokens; 32+ characters (`openssl rand -base64 48`)                  |
| `JWT_ACCESS_TTL`                               | no       | `900`          | Access token lifetime, in seconds                                                |
| `REFRESH_TOKEN_TTL_DAYS`                       | no       | `7`            | A refresh token expires after this many days without use                         |
| `REFRESH_TOKEN_MAX_TTL_DAYS`                   | no       | `30`           | A session ends this many days after login (at least the idle lifetime)           |
| `BCRYPT_ROUNDS`                                | no       | `12`           | Password hashing cost; at least `10` in production (`4` in the e2e tests)        |
| `TRUST_PROXY_HOPS`                             | no       | `0`            | Reverse proxies in front of the API; `0` ignores `X-Forwarded-For`               |
| `SMTP_HOST`                                    | **yes**  |                | SMTP server; `localhost` reaches Mailpit locally                                 |
| `SMTP_PORT`                                    | no       | `587`          | SMTP port (`1025` for Mailpit)                                                   |
| `SMTP_SECURE`                                  | no       | `false`        | `true`: TLS from the start (port 465). `false`: STARTTLS, required in production |
| `SMTP_USER`, `SMTP_PASSWORD`                   | no       |                | SMTP login: both or neither                                                      |
| `MAIL_FROM`                                    | **yes**  |                | Sender address, shown as "SimpleFood"                                            |
| `MAIL_NOTIFY_TO`                               | **yes**  |                | The shop's inbox: new orders and contact messages                                |
| `FRONTEND_URL`                                 | **yes**  |                | The site's address, for links in emails; `https` in production                   |

`POSTGRES_*` and `MAILPIT_*` in `.env` only configure Docker Compose; the API doesn't read them.

**Behind a reverse proxy, set `TRUST_PROXY_HOPS`.** Rate limits count per client IP. With the default `0`, the API sees the proxy's (or the Next server's) address for everyone, so the per-IP limits on register and refresh apply to the whole site at once. Set it to the number of proxies in front of the API, and make sure each one forwards `X-Forwarded-For`.

**Generate `JWT_ACCESS_SECRET`** with `openssl rand -base64 48` (64 random characters). The value in `.env.example` is for local development only: with `NODE_ENV=production` the app refuses to start with it. Rotating the secret invalidates every access token at once, but signs no one out: clients get a 401, refresh and carry on (refresh tokens aren't JWTs, so they keep working).

## Scripts

| Command                                                         | What it does                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run start:dev`                                             | Start with watch mode                                                        |
| `npm run start:debug`                                           | Start with watch mode and the debugger                                       |
| `npm run build` / `npm run start:prod`                          | Compile to `dist/` / run the compiled app                                    |
| `npm run typecheck`                                             | Type-check everything, tests included                                        |
| `npm run lint`                                                  | oxlint (type-aware)                                                          |
| `npm run format` / `npm run format:check`                       | Prettier: write / check                                                      |
| `npm test`                                                      | Unit tests (no Docker needed)                                                |
| `npm run test:watch` / `npm run test:cov`                       | Unit tests in watch mode / with coverage (report in `coverage/unit/`)        |
| `npm run test:debug`                                            | Unit tests with the debugger attached                                        |
| `npm run test:e2e` / `npm run test:e2e:cov`                     | E2E tests (needs Docker running) / with coverage (report in `coverage/e2e/`) |
| `npm run migration:generate -- src/database/migrations/<Name>`  | Generate a migration from entity changes                                     |
| `npm run migration:create -- src/database/migrations/<Name>`    | Create an empty migration                                                    |
| `npm run migration:run` / `migration:revert` / `migration:show` | Apply / undo the last / list migrations                                      |

The migration scripts (except `create`) build first and use the TypeORM CLI entry point [src/database/data-source.ts](src/database/data-source.ts). That file loads `.env` and validates it with the same schema as the app.

## Testing

- **Unit tests** (`src/**/*.spec.ts`) cover pure logic: no database and no Docker.
- **E2E tests** (`test/**/*.e2e-spec.ts`) boot the real app through `createTestApp()` in [test/utils/test-app.ts](test/utils/test-app.ts). It applies the same `configureApp()` pipeline as production.
  - Before they run, [test/setup/global-setup.ts](test/setup/global-setup.ts) starts a **throwaway Postgres 18 with Testcontainers**, applies the migrations to a template database, and sets the test environment. The e2e tests never touch your dev database, and they don't need `.env`.
  - **Every Jest worker gets its own copy of that database** (`CREATE DATABASE … TEMPLATE`; see [test/setup/worker-database.ts](test/setup/worker-database.ts)), so files running in parallel never see each other's data. `test/database.e2e-spec.ts` guards this.
  - **Files that write data** call `resetDatabase(dataSource)` in `beforeEach` ([test/utils/database.ts](test/utils/database.ts)), and create rows with the factories in [test/utils/factories.ts](test/utils/factories.ts) (`createMedia(dataSource, { width: null })`). Add a factory for each new entity.
  - Get a `DataSource` with `app.get(DataSource)` in tests that boot the app, or `openTestDataSource()` in tests that only use repositories.
  - **Logged-in calls:** `createUser(dataSource, { role: UserRole.Admin })` (hashed at cost 4), then `const { accessToken } = await loginAs(app, user)` and `.set(bearer(accessToken))` ([test/utils/auth.ts](test/utils/auth.ts)). A test-only controller needs `@Public()` unless it is meant to require a login.
  - **Email:** `createTestApp()` replaces SMTP with a `FakeMailTransport`, so no test sends real mail. Mail goes out after the response: read it with `(await mailbox(app)).sent` ([test/utils/mail.ts](test/utils/mail.ts)), which waits for it, and `clear()` it in `beforeEach` when the app is shared. Do that **before** `resetDatabase()` in suites that call forgot-password: its account lookup runs in the background, and must not overlap the truncate.
  - **Rate limits** stay at their production values in tests. Files that call the limited routes call `resetRateLimits(app)` in `beforeEach` ([test/utils/throttler.ts](test/utils/throttler.ts)).
  - `test/migrations.e2e-spec.ts` checks the migrations themselves: they apply cleanly, the schema matches the entities, and every `down()` reverts.
- The `@nestjs/swagger` CLI plugin doesn't run under Jest (`isolatedModules`), so DTO properties only appear in the docs of a real build.
- **Coverage** is reported separately for each suite (`coverage/unit/`, `coverage/e2e/`), and the two complement each other. Unit tests cover pure logic; controllers, filters and the HTTP pipeline (`app.setup.ts`) are covered by the e2e tests. Both measure the same files: the exclusions (bootstrap, CLI entry, migrations, modules, entities, DTOs) are defined once, as `coverageExclusions` in [jest.config.ts](jest.config.ts).

## Database migrations

The schema changes **only** through reviewed migration files in `src/database/migrations/`.

1. Change or add an entity (`*.entity.ts`). Column and table names become snake_case automatically.
2. `npm run migration:generate -- src/database/migrations/AddProducts`
3. Review the generated SQL, including `down()`, and commit it with the entity change.
4. `npm run migration:run`

The app never runs migrations on startup. In production they run as a separate step before the new version starts. CI fails if an entity changed without a migration, or if a `down()` doesn't revert.

## Project structure

```text
src/
  main.ts           bootstrap: configureApp(), shutdown hooks, listen
  app.setup.ts      HTTP pipeline shared with the e2e tests: security headers, /api prefix,
                    logger, CORS, pipes, exception filter, Swagger
  app.module.ts     root module: config, database, logger, feature modules
  config/           env schema and `registerAs` namespaces (database, logger, auth, mail), Swagger setup
  common/           cross-cutting code: exception filter + error DTOs, request IDs, pipes,
                    validation error formatting, response envelope + pagination, Swagger
                    response decorators, @NoStore() (http/)
  database/         TypeORM CLI data source, naming strategy, SQL logger (never logs parameters),
                    entities/ (base entity, Seo), migrations/
  auth/             sessions and access control: POST /api/auth/register, /login, /refresh,
                    /logout, /change-password, /forgot-password, /reset-password; the global
                    JwtAuthGuard and RolesGuard,
                    @Public(), @OptionalAuth(), @Roles(), @CurrentUser(), AuthThrottlerGuard
                    with @ThrottleBy()
  users/            accounts (User entity, PasswordService), single-use links sent by email
                    (AccountTokensService, the account emails): GET and PATCH /api/users/me
  orders/           POST /api/orders (guests too, priced on the server), GET /api/orders/me;
                    the order emails (templates/)
  contact/          POST /api/contact: saves the message, emails the shop (honeypot against bots)
  mail/             MailService (sends in the background, after the commit), the SMTP
                    transport, shared email template helpers (templates/)
  health/           GET /health (Terminus)
  media/            Media entity (uploaded files) and its response DTO
  catalog/          products and product categories: GET /api/products, /api/products/:slug,
                    /api/product-categories
  content/          site settings, navigation menus and pages with sections: GET /api/settings,
                    /api/menus/:key, /api/pages/:slug (the homepage is slug `home`)
  blog/             published blog posts and blog categories: GET /api/blog-posts,
                    /api/blog-posts/:slug, /api/blog-categories
test/
  setup/            Testcontainers global setup/teardown
  utils/            createTestApp(), resetDatabase(), factories, loginAs() + bearer(),
                    resetRateLimits(), FakeMailTransport + mailbox()
  *.e2e-spec.ts     e2e suites
docs/               migration plan
```

## Conventions

- **Feature module layout:** one folder per kind of file, with the module file at the root. Only create the folders a module needs. Unit tests (`*.spec.ts`) sit next to the file they test.

  ```text
  src/<feature>/
    <feature>.module.ts
    controllers/   *.controller.ts
    services/      *.service.ts
    entities/      *.entity.ts
    dto/           *.dto.ts (responses) and *.query.dto.ts (query filters)
    mappers/       entity -> DTO functions
    filters/       exception filters used only by this module (global ones live in common/)
    guards/        *.guard.ts
    decorators/    *.decorator.ts
    types/         <feature>.types.ts (interfaces and types shared within the module)
    templates/     emails this module sends (helpers in mail/templates/)
  ```

  Keep the file suffixes (`.controller.ts`, `.dto.ts`, `.entity.ts`): the Swagger CLI plugin, the TypeORM entity pattern and the coverage exclusions find files by them.

- **Imports:** relative (`./`, `../`) within a module, and the `@/` alias (= `src/`) across modules, e.g. `import { Media } from '@/media/entities/media.entity'`. Files at the root of `src/` and everything in `test/` use `@/` (as in the frontend). The alias is set up in four places:
  - `paths` in `tsconfig.json`; `nest build` rewrites it to relative paths in `dist/`
  - `moduleNameMapper` in both Jest configs
  - `tsconfig-paths/register` in `test/setup/global-setup.ts`, which Jest loads outside its module system
- **Routes:** everything is under `/api`, except `/health`, which stays at the root for infrastructure probes.
- **HTTP-level settings** (headers, CORS, pipes, filters) go in `configureApp()` in [src/app.setup.ts](src/app.setup.ts), so the e2e tests use exactly what production uses.
- **Responses** are always wrapped: `{ data }` for one resource, `{ data, meta }` for a page of a list, where `meta` is `{ page, pageSize, total, pageCount }`. Lists take `?page=&pageSize=` (default 1 and 20, maximum 100). The helpers live in [src/common/http/](src/common/http/):
  - `PaginationQueryDto`: extend it for list filters
  - `toSkipTake()` and `paginate()`: build the page
  - `@ApiPaginatedResponse(Dto)` and `@ApiDataResponse(Dto)`: document the envelope in Swagger, which can't infer generic types
- **Authentication is on by default.** The global `JwtAuthGuard` refuses every route without a valid `Authorization: Bearer <accessToken>` (401 with `WWW-Authenticate`). Mark the public ones with `@Public()` (on the controller or the method).
  - `@Roles(UserRole.Admin)` limits a route to roles (403 otherwise); `@CurrentUser()` gives the caller (`{ id, role }`, read from the token without a query).
  - **Ownership comes from the token:** a route for the caller's own data uses `@CurrentUser()`, never an id from the URL (`/users/me`, not `/users/:id`).
  - Document a protected route with `@ApiAuth()`, so Swagger shows the lock and the 401.
  - `@OptionalAuth()` serves guests and logged-in callers alike: no header means a guest, but a token that is sent must be valid (401 otherwise, so the client refreshes instead of carrying on as a guest). Read the caller with `@CurrentUser({ optional: true })`.
  - **Rate limits:** a route that checks a password, creates accounts or sends mail gets `@UseGuards(AuthThrottlerGuard)` with its own `@Throttle()`, plus `@ApiRateLimited()` for the docs. A logged-in caller is counted per account, a guest per IP; `@ThrottleBy('email')` counts a guest per IP and that body field instead (login: `identifier`). There is no global limit: every server-rendered page reaches the API from the Next server's single IP.
  - Responses that carry tokens or personal data get `@NoStore()` (`Cache-Control: no-store`).
- **Entities and responses:** controllers never return entities; they map them to response DTOs (e.g. `toMediaDto()`). Primary keys are UUIDv7 from Postgres (`AppBaseEntity`).
- **Errors** always have one shape (documented as `ErrorResponseDto` in Swagger):

  ```json
  {
    "error": {
      "status": 400,
      "code": "BAD_REQUEST",
      "message": "Validation failed",
      "requestId": "6ed2444b-8405-40b9-affa-d1db395c4c83",
      "details": [{ "field": "email", "messages": ["email must be an email"] }]
    }
  }
  ```

  Unexpected errors return a generic `500` message; the real cause is only logged.

- **Validation:** request DTOs use `class-validator`. Unknown properties are rejected, there's no implicit type conversion, and strings are trimmed (except fields whose name contains `password`).
- **Request IDs:** every response has an `X-Request-Id` header, and every log line of that request has the same `reqId`. A safe incoming `X-Request-Id` is reused.
- **Logging:** use `new Logger(MyClass.name)` from `@nestjs/common`; it goes through pino automatically. The `Authorization`, `Cookie` and `Set-Cookie` headers are redacted, and SQL is logged without its parameters (they can hold emails and password hashes). Never log request bodies, tokens or hashes.

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on pull requests and pushes to `main`:

format check → typecheck → lint → build → unit tests → e2e tests (Testcontainers) → `npm audit` of production dependencies.

Dependabot opens weekly update PRs for npm packages and GitHub Actions.

## License

Private project; all rights reserved (`UNLICENSED`).
