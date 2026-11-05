import { Logger } from '@nestjs/common';
import { TypeOrmLogger } from './typeorm-logger';

describe('TypeOrmLogger', () => {
  const logger = new TypeOrmLogger(['error', 'warn', 'migration']);
  const hash = '$2b$12$abcdefghijklmnopqrstuuJ3S3k9b8tq2wRtUhR2CwQ0xY1zN6mQ.';
  const insert =
    'INSERT INTO "app_user"("username", "email", "password_hash") VALUES ($1, $2, $3)';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs a failed query with its SQL and error, never its parameters', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockReturnValue();

    logger.logQueryError(
      'duplicate key value violates unique constraint "UQ_user_email"',
      insert,
      ['Ivan', 'ivan@example.com', hash],
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const [line] = warn.mock.calls[0] as [string];
    expect(line).toContain(insert);
    expect(line).toContain('UQ_user_email');
    expect(line).not.toContain('ivan@example.com');
    expect(line).not.toContain(hash);
    expect(line).not.toContain('PARAMETERS');
  });

  it('leaves out slow-query parameters too', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockReturnValue();

    logger.logQuerySlow(1500, insert, ['Ivan', 'ivan@example.com', hash]);

    const [line] = warn.mock.calls[0] as [string];
    expect(line).toContain('1500');
    expect(line).not.toContain(hash);
  });

  it('logs migrations', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockReturnValue();

    logger.logMigration('Migration AddUsers1793291621423 has been executed');

    expect(log).toHaveBeenCalledWith(
      'Migration AddUsers1793291621423 has been executed',
    );
  });

  it('skips the kinds it was not asked for: every query', () => {
    const debug = jest.spyOn(Logger.prototype, 'debug').mockReturnValue();

    logger.logQuery('SELECT 1', []);

    expect(debug).not.toHaveBeenCalled();
  });
});
