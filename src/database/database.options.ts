import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/** Env variables the DB connection is built from (validated in config/env.validation.ts). */
export interface DatabaseEnv {
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
}

/**
 * Single source of truth for the DB connection, shared by the Nest app
 * (TypeOrmModule) and the TypeORM CLI (data-source.ts).
 *
 * Globs point at compiled `.js` files: both the app and the CLI run from `dist/`.
 * `__dirname` is `dist/database` at runtime.
 */
export function buildDataSourceOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    applicationName: 'simplefood-api',
    namingStrategy: new SnakeNamingStrategy(),

    entities: [join(__dirname, '..', '**', '*.entity.js')],

    // Schema changes only via reviewed migrations, never auto-sync.
    synchronize: false,

    logging: ['error', 'warn', 'migration'],

    migrationsTableName: 'migrations',
    // Migrations run as an explicit deploy step (`npm run migration:run`), not on boot.
    migrationsRun: false,
    migrations: [join(__dirname, 'migrations', '*.js')],
  };
}
