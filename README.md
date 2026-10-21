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

| Variable                                       | Required | Default        | Purpose                                                                       |
| ---------------------------------------------- | -------- | -------------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`                                     | **yes**  |                | `development`, `production` or `test`                                         |
| `PORT`                                         | no       | `1339`         | HTTP port (`1338` is the legacy Strapi API)                                   |
| `LOG_LEVEL`                                    | no       | per `NODE_ENV` | pino level; `test` = `silent`, `development` = `debug`, `production` = `info` |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | **yes**  |                | PostgreSQL connection                                                         |
| `DB_PORT`                                      | no       | `5432`         | PostgreSQL port (`5433` locally, see `.env.example`)                          |
| `CORS_ORIGINS`                                 | **yes**  |                | Comma-separated list of allowed browser origins                               |
| `SWAGGER_ENABLED`                              | no       | `false`        | Serve the API docs. Keep it off in production.                                |

`POSTGRES_*` and `MAILPIT_*` in `.env` only configure Docker Compose; the API doesn't read them.

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
  - Before they run, [test/setup/global-setup.ts](test/setup/global-setup.ts) starts a **throwaway Postgres 18 with Testcontainers**, applies the migrations, and sets the test environment. The e2e tests never touch your dev database, and they don't need `.env`.
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
  config/           env schema and `registerAs` namespaces (database, logger), Swagger setup
  common/           cross-cutting code: exception filter + error DTOs, request IDs, pipes,
                    validation error formatting
  database/         TypeORM CLI data source, naming strategy, migrations/
  health/           GET /health (Terminus)
test/
  setup/            Testcontainers global setup/teardown
  utils/            createTestApp() and other e2e helpers
  *.e2e-spec.ts     e2e suites
docs/               migration plan
```

## Conventions

- **Routes:** everything is under `/api`, except `/health`, which stays at the root for infrastructure probes.
- **HTTP-level settings** (headers, CORS, pipes, filters) go in `configureApp()` in [src/app.setup.ts](src/app.setup.ts), so the e2e tests use exactly what production uses.
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
- **Logging:** use `new Logger(MyClass.name)` from `@nestjs/common`; it goes through pino automatically. `Authorization` and `Cookie` headers are redacted. Never log request bodies.

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on pull requests and pushes to `main`:

format check → typecheck → lint → build → unit tests → e2e tests (Testcontainers) → `npm audit` of production dependencies.

Dependabot opens weekly update PRs for npm packages and GitHub Actions.

## License

Private project; all rights reserved (`UNLICENSED`).
