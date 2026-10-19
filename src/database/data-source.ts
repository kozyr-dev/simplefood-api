import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import validationSchema from '../config/env.validation';
import { buildDataSourceOptions, DatabaseEnv } from './database.options';

/**
 * Entry point for the TypeORM CLI only (migration:generate/run/revert/show).
 * The Nest app never imports this file; it gets the same options via TypeOrmModule.
 *
 * Real environment variables win over `.env` (dotenv never overrides them),
 * and a missing `.env` (e.g. in production) is silently ignored.
 */
config({ quiet: true });

// Same schema as ConfigModule, so the CLI and the app can never disagree.
const { error, value } = validationSchema.validate(process.env, {
  allowUnknown: true,
  abortEarly: false,
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export default new DataSource(buildDataSourceOptions(value as DatabaseEnv));
