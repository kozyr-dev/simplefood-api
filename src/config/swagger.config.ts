import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';

/**
 * Swagger UI at /api/docs, the OpenAPI JSON at /api/docs-json. Spelled out in
 * full: SwaggerModule ignores the global `api` prefix by default.
 */
export const SWAGGER_PATH = 'api/docs';

/**
 * `HealthController.check` -> `Health_check`. These become function names in
 * generated frontend clients, so they must be short and unique: Nest's default
 * is long, and the bare method name would collide (`findAll` everywhere).
 */
export const operationIdFactory: NonNullable<
  SwaggerDocumentOptions['operationIdFactory']
> = (controllerKey, methodKey) =>
  `${controllerKey.replace(/Controller$/, '')}_${methodKey}`;

/**
 * Read from package.json at runtime: `npm_package_version` is only set when
 * started through npm, not with `node dist/main` (e.g. in Docker).
 * `dist/config` and `src/config` (under Jest) are both two levels below it.
 */
export function readApiVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
  ) as { version: string };
  return packageJson.version;
}

export function buildSwaggerDocumentConfig() {
  return (
    new DocumentBuilder()
      .setTitle('SimpleFood API')
      .setDescription(
        'REST API of the SimpleFood shop. Every error response uses the ' +
          '`ErrorResponseDto` shape; quote its `requestId` when reporting a problem.',
      )
      .setVersion(readApiVersion())
      // One entry per @ApiTags() name; shown as section descriptions in the UI.
      .addTag(
        'health',
        'Liveness check for Docker and uptime monitoring (outside the /api prefix).',
      )
      .addTag('catalog', 'Products and product categories.')
      .addTag('content', 'Site-wide settings and navigation menus.')
      // JWT scheme for phase 3; protected endpoints then add @ApiBearerAuth().
      .addBearerAuth()
      // Errors any endpoint can return, in the shape AllExceptionsFilter sends.
      .addGlobalResponse(
        {
          status: 400,
          description:
            'Invalid request: validation failed, malformed JSON or a bad parameter.',
          type: ErrorResponseDto,
        },
        {
          status: 404,
          description: 'Route or resource not found.',
          type: ErrorResponseDto,
        },
        {
          status: 500,
          description:
            'Unexpected server error. The cause is logged, never returned.',
          type: ErrorResponseDto,
        },
      )
      .build()
  );
}

/**
 * Serves Swagger UI and the OpenAPI JSON. Called from configureApp() only when
 * SWAGGER_ENABLED is true (off by default: the docs list the whole API surface).
 */
export function setupSwagger(app: INestApplication): void {
  // A factory: the document is built on the first request, not at startup.
  const documentFactory = () =>
    SwaggerModule.createDocument(app, buildSwaggerDocumentConfig(), {
      operationIdFactory,
    });

  SwaggerModule.setup(SWAGGER_PATH, app, documentFactory, {
    customSiteTitle: 'SimpleFood API docs',
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
    // JSON only; the YAML copy would just be one more endpoint to expose.
    raw: ['json'],
    // Keeps a pasted bearer token across page reloads.
    swaggerOptions: { persistAuthorization: true },
  });
}
