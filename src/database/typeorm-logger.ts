import { Logger } from '@nestjs/common';
import { AbstractLogger, type LogLevel, type LogMessage } from 'typeorm';

/**
 * TypeORM's own logs (failed and slow queries, migrations) through Nest's
 * logger: in the app that's pino, so they're JSON like every other line
 * instead of raw console output.
 *
 * Never with query parameters: they hold password hashes, emails, phone
 * numbers. The SQL text has only placeholders ($1, $2), and the driver's
 * error message names the constraint, not the values.
 */
export class TypeOrmLogger extends AbstractLogger {
  private readonly logger = new Logger('TypeORM');

  protected writeLog(
    level: LogLevel,
    logMessage: LogMessage | string | number | (LogMessage | string | number)[],
  ): void {
    const text = this.prepareLogMessages(logMessage, {
      appendParameterAsComment: false,
      highlightSql: false,
    })
      .map(({ prefix, message }) =>
        prefix ? `${prefix} ${String(message)}` : String(message),
      )
      .join(' ');

    // AbstractLogger reports failed and slow queries as 'warn'.
    switch (level) {
      case 'warn':
        this.logger.warn(text);
        break;
      case 'query':
      case 'schema':
        this.logger.debug(text);
        break;
      default:
        this.logger.log(text);
    }
  }
}
