import { join } from 'node:path';
import { registerAs } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from '../database/snake-naming.strategy';

/**
 * Database config under the `database` namespace: the single source of truth
 * for the Nest app (`databaseConfig.asProvider()`) and the TypeORM CLI
 * (`database/data-source.ts`).
 *
 * Reading `process.env` here is safe: ConfigModule validates it with the Joi
 * schema (config/env.validation.ts) and fills in defaults before any
 * `registerAs` factory runs. data-source.ts does the same for the CLI.
 *
 * Globs point at compiled `.js` files; `__dirname` is `dist/config` at runtime.
 */
export default registerAs('database', (): DataSourceOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  applicationName: 'simplefood-api',
  namingStrategy: new SnakeNamingStrategy(),

  entities: [join(__dirname, '..', '**', '*.entity.js')],

  // Schema changes only via reviewed migrations, never auto-sync.
  synchronize: false,

  logging: ['error', 'warn', 'migration'],

  migrationsTableName: 'migrations',
  // Migrations run as an explicit deploy step (`npm run migration:run`), not on boot.
  migrationsRun: false,
  migrations: [join(__dirname, '..', 'database', 'migrations', '*.js')],
}));
