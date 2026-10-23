import { DataSource, type DataSourceOptions } from 'typeorm';
import databaseConfig from '@/config/database.config';

/**
 * A DataSource on this worker's test database, for tests that work with
 * repositories directly instead of through HTTP. Tests that boot the app can
 * use `app.get(DataSource)` instead. Remember `await dataSource.destroy()`.
 */
export function openTestDataSource(): Promise<DataSource> {
  return new DataSource({
    ...databaseConfig(),
    logging: false,
  } as DataSourceOptions).initialize();
}

/**
 * Empties every entity table (including many-to-many join tables) in this
 * worker's database, keeping the schema and the migrations table. Call it in
 * `beforeEach` in test files that write data.
 */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  const escape = (name: string) => dataSource.driver.escape(name);
  const tables = dataSource.entityMetadatas
    .filter((metadata) => metadata.tableType !== 'view')
    .map(({ schema, tableName }) =>
      (schema ? [schema, tableName] : [tableName]).map(escape).join('.'),
    );

  if (tables.length) {
    await dataSource.query(
      `TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
}
