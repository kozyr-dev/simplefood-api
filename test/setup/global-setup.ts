import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource, type DataSourceOptions } from 'typeorm';
import databaseConfig from '../../src/config/database.config';

/** Same major version as docker-compose.yml and production. */
const POSTGRES_IMAGE = 'postgres:18-alpine';

declare global {
  // Shared with global-teardown.ts (both run in Jest's parent process).
  var __POSTGRES__: StartedPostgreSqlContainer | undefined;
}

/**
 * Runs once before all e2e test files: starts a throwaway Postgres, points the
 * app at it and applies the real migrations.
 *
 * The variables set here are inherited by Jest's worker processes, and real
 * env vars win over `.env` (ConfigModule never overrides them), so the e2e
 * tests are hermetic: same environment locally and in CI, no `.env` needed,
 * and the docker-compose dev database is never touched.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  globalThis.__POSTGRES__ = container;

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_HOST: container.getHost(),
    DB_PORT: String(container.getPort()),
    DB_USER: container.getUsername(),
    DB_PASSWORD: container.getPassword(),
    DB_NAME: container.getDatabase(),
    // Required by the env schema; a fixed value the CORS tests rely on.
    CORS_ORIGINS: 'http://localhost:3000',
  });

  // Same options the app and the CLI use (read from the env set above).
  const dataSource = new DataSource(databaseConfig() as DataSourceOptions);
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
