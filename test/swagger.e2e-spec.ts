import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

/**
 * Builds the app with SWAGGER_ENABLED forced on or off, so these tests don't
 * depend on whatever `.env` (or the CI environment) sets. Every other config
 * value is the real one.
 */
async function createApp(
  swaggerEnabled: boolean,
): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  const config = app.get(ConfigService);
  const realGet = config.get.bind(config);
  jest
    .spyOn(config, 'get')
    .mockImplementation((key: string) =>
      key === 'SWAGGER_ENABLED' ? swaggerEnabled : realGet(key),
    );

  configureApp(app);
  await app.init();
  return app;
}

const { version } = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
) as { version: string };

/*
 * Note: the @nestjs/swagger CLI plugin doesn't run under Jest (ts-jest uses
 * isolatedModules), so DTO *properties* aren't in this document. These tests
 * cover what doesn't depend on the plugin; the plugin's output is checked on
 * the real build (`npm run build`, then /api/docs-json).
 */
describe('Swagger (e2e)', () => {
  describe('when enabled', () => {
    let app: INestApplication<App>;
    let document: OpenAPIObject;

    beforeAll(async () => {
      app = await createApp(true);
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      document = res.body as OpenAPIObject;
    });

    afterAll(async () => {
      await app.close();
    });

    const http = () => request(app.getHttpServer());

    describe('Swagger UI', () => {
      it('is served at /api/docs with the security headers', async () => {
        const res = await http().get('/api/docs').expect(200);

        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.headers['content-security-policy']).toContain(
          "script-src 'self'",
        );
        expect(res.headers['x-content-type-options']).toBe('nosniff');
      });

      // Guards the "works with the default CSP" property: no inline code and
      // no third-party hosts, which `script-src 'self'` would block.
      it('loads only same-origin scripts, with no inline code', async () => {
        const res = await http().get('/api/docs').expect(200);
        const html = res.text;

        expect(html).not.toMatch(/<script>[^<]+<\/script>/);
        expect(html).not.toMatch(/(src|href)="https?:\/\//);
        expect(html).toContain('swagger-ui-bundle.js');
      });

      it('serves its assets', async () => {
        const res = await http()
          .get('/api/docs/swagger-ui-bundle.js')
          .expect(200);

        expect(res.headers['content-type']).toMatch(/javascript/);
      });
    });

    describe('OpenAPI document', () => {
      it('is OpenAPI 3 with the title and package.json version', () => {
        expect(document.openapi).toMatch(/^3\./);
        expect(document.info).toMatchObject({
          title: 'SimpleFood API',
          version,
        });
      });

      it('includes the /api prefix in paths, and /health outside it', () => {
        expect(Object.keys(document.paths)).toEqual(
          expect.arrayContaining(['/api', '/health']),
        );
        expect(document.paths['/api/health']).toBeUndefined();
      });

      it('uses short, unique operation IDs', () => {
        expect(document.paths['/health'].get?.operationId).toBe('Health_check');
      });

      it('groups endpoints under explicit tags with descriptions', () => {
        expect(document.paths['/health'].get?.tags).toEqual(['health']);
        expect(document.tags).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: 'health' })]),
        );
      });

      it('documents the shared error shape on every endpoint', () => {
        expect(document.components?.schemas?.ErrorResponseDto).toBeDefined();

        for (const status of ['400', '404', '500']) {
          expect(
            document.paths['/health'].get?.responses[status],
          ).toMatchObject({
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponseDto' },
              },
            },
          });
        }
      });

      it('declares the bearer (JWT) auth scheme', () => {
        expect(document.components?.securitySchemes?.bearer).toMatchObject({
          type: 'http',
          scheme: 'bearer',
        });
      });

      it('is served as JSON only (no YAML copy)', async () => {
        await http().get('/api/docs-yaml').expect(404);
      });
    });
  });

  describe('when disabled', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createApp(false);
    });

    afterAll(async () => {
      await app.close();
    });

    it.each(['/api/docs', '/api/docs-json'])(
      'GET %s is a regular 404',
      async (path) => {
        const res = await request(app.getHttpServer()).get(path).expect(404);

        expect(res.body.error.code).toBe('NOT_FOUND');
      },
    );
  });
});
