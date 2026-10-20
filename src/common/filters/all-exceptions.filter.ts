import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/** The one error shape every endpoint returns. */
export interface ErrorResponseBody {
  error: {
    status: number;
    /** Machine-readable: `NOT_FOUND`, `BAD_REQUEST`, or a custom code such as `EMAIL_TAKEN`. */
    code: string;
    message: string;
    /** Per-field problems; only present for validation errors. */
    details?: unknown[];
    /** Set when `details` was capped. */
    truncated?: true;
  };
}

/**
 * Catches everything (`@Catch()` with no arguments) and replies with
 * ErrorResponseBody. Unexpected errors become a generic 500: their message
 * may contain SQL, values or file paths, so it is logged, never sent.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // Resolved here, not in the constructor: the adapter may not exist yet then.
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const body = this.toBody(exception);

    if (body.error.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const request = ctx.getRequest();
      this.logger.error(
        `${httpAdapter.getRequestMethod(request)} ${httpAdapter.getRequestUrl(request)} -> ${body.error.status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    httpAdapter.reply(ctx.getResponse(), body, body.error.status);
  }

  private toBody(exception: unknown): ErrorResponseBody {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    const bodyParserError = this.fromBodyParserError(exception);
    if (bodyParserError) {
      return bodyParserError;
    }

    return error(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error');
  }

  private fromHttpException(exception: HttpException): ErrorResponseBody {
    const status = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return error(status, response);
    }

    const { message, code, details, truncated } = response as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      truncated?: unknown;
    };

    return error(
      status,
      typeof message === 'string'
        ? message
        : Array.isArray(message)
          ? message.join('; ')
          : exception.message,
      {
        code: typeof code === 'string' ? code : undefined,
        details: Array.isArray(details) && details.length ? details : undefined,
        truncated: truncated === true || undefined,
      },
    );
  }

  /**
   * Express's body parser fails before Nest's routing. Malformed JSON is a
   * SyntaxError, which Nest's Express adapter already turns into a
   * BadRequestException (so it arrives above as an HttpException). Other
   * parser errors (body too large, unsupported charset/encoding) arrive as-is:
   * not HttpExceptions, but with a 4xx `status` and an `entity.*` `type`.
   */
  private fromBodyParserError(exception: unknown): ErrorResponseBody | null {
    if (typeof exception !== 'object' || exception === null) return null;

    const { status, type } = exception as { status?: unknown; type?: unknown };
    if (typeof status !== 'number' || status < 400 || status >= 500)
      return null;
    if (typeof type !== 'string' || !type.startsWith('entity.')) return null;

    return error(
      status,
      type === 'entity.too.large'
        ? 'Request body too large'
        : 'Invalid request body',
    );
  }
}

function error(
  status: number,
  message: string,
  extra: { code?: string; details?: unknown[]; truncated?: true } = {},
): ErrorResponseBody {
  return {
    error: {
      status,
      code: extra.code ?? HttpStatus[status] ?? 'ERROR',
      message,
      ...(extra.details && { details: extra.details }),
      ...(extra.truncated && { truncated: true as const }),
    },
  };
}
