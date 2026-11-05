import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../filters/error-response.dto';
import { PaginationMetaDto } from './pagination-meta.dto';

/*
 * TypeScript erases generic types at runtime, so Swagger can't see what's
 * inside `Paginated<ProductDto>` or `DataResponse<ProductDto>`. These
 * decorators describe the envelope by hand, as the Nest docs recommend.
 */

/** Documents `{ data: Model[], meta: PaginationMetaDto }` as the 200 response. */
export function ApiPaginatedResponse(model: Type) {
  return applyDecorators(
    ApiExtraModels(PaginationMetaDto, model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
    }),
  );
}

/**
 * Documents `{ data: Model }`, or `{ data: Model[] }` with `isArray`, as the
 * 200 response (or `status`, e.g. 201 for a route that creates).
 */
export function ApiDataResponse(
  model: Type,
  {
    isArray = false,
    status = HttpStatus.OK,
  }: { isArray?: boolean; status?: HttpStatus } = {},
) {
  const item = { $ref: getSchemaPath(model) };
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      schema: {
        type: 'object',
        required: ['data'],
        properties: {
          data: isArray ? { type: 'array', items: item } : item,
        },
      },
    }),
  );
}

/**
 * A route that needs a login: the bearer scheme (Swagger UI's Authorize
 * button) and the 401 JwtAuthGuard sends.
 */
export function ApiAuth() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description:
        'No access token, or it is invalid or expired: refresh and retry. ' +
        'Also when the account was blocked or deleted since the token was issued.',
      headers: {
        'WWW-Authenticate': {
          description:
            '`Bearer`, or `Bearer error="invalid_token"` when a token was sent.',
          schema: { type: 'string' },
        },
      },
    }),
  );
}

/** A route behind AuthThrottlerGuard: the 429 it sends past its limit. */
export function ApiRateLimited() {
  return ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Too many requests (`TOO_MANY_REQUESTS`).',
    headers: {
      'Retry-After': {
        description: 'Seconds until the limit resets.',
        schema: { type: 'integer' },
      },
    },
  });
}
