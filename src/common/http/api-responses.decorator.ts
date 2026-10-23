import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
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

/** Documents `{ data: Model }`, or `{ data: Model[] }` with `isArray`. */
export function ApiDataResponse(
  model: Type,
  { isArray = false }: { isArray?: boolean } = {},
) {
  const item = { $ref: getSchemaPath(model) };
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
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
