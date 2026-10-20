import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/**
 * Terminus reports a failed check by throwing ServiceUnavailableException
 * with its own body (`{ status: 'error', info, error, details }`). Monitoring
 * tools expect that format, so it is sent as-is instead of being rewritten by
 * the global AllExceptionsFilter. Controller-scoped filters run before global ones.
 */
@Catch(ServiceUnavailableException)
export class HealthCheckFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: ServiceUnavailableException, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    httpAdapter.reply(
      host.switchToHttp().getResponse(),
      exception.getResponse(),
      exception.getStatus(),
    );
  }
}
