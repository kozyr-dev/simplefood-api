import { Controller, Get, INestApplication } from '@nestjs/common';
import { Writable } from 'node:stream';
import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import request from 'supertest';
import { App } from 'supertest/types';
import { REQUEST_ID_HEADER } from '../src/common/logging/constants';
import loggerConfig from '../src/config/logger.config';
import { createTestApp, UUID } from './utils/test-app';

/** Test-only routes; registered only in this testing module. */
@Controller('logging-test')
class LoggingTestController {
  @Get('crash')
  crash(): never {
    throw new Error('connection failed: password=secret123');
  }
}

interface LogLine {
  level: number;
  msg: string;
  reqId?: string;
  context?: string;
  req?: {
    id: string;
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  res?: { statusCode: number };
}

describe('Logging and request IDs (e2e)', () => {
  let app: INestApplication<App>;
  let lines: LogLine[] = [];

  beforeAll(async () => {
    // The real logger options (redaction, request IDs, levels), but at `info`
    // and written to memory, so the tests can read the log lines.
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        for (const line of chunk.toString().split('\n').filter(Boolean)) {
          lines.push(JSON.parse(line) as LogLine);
        }
        done();
      },
    });
    const options = loggerConfig().pinoHttp as Options;
    const captured: Params = {
      pinoHttp: [{ ...options, level: 'info' }, sink],
    };

    app = await createTestApp({
      controllers: [LoggingTestController],
      override: (builder) =>
        builder.overrideProvider(loggerConfig.KEY).useValue(captured),
    });
  });

  beforeEach(() => {
    lines = [];
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const requestLine = (id: string) => lines.find((line) => line.req?.id === id);

  describe('X-Request-Id', () => {
    it('is generated when the client sends none', async () => {
      const res = await http().get('/api/ping').expect(200);

      expect(res.headers['x-request-id']).toMatch(UUID);
    });

    it('reuses a valid incoming ID', async () => {
      const res = await http()
        .get('/api/ping')
        .set(REQUEST_ID_HEADER, 'nginx-abc-123')
        .expect(200);

      expect(res.headers['x-request-id']).toBe('nginx-abc-123');
      expect(requestLine('nginx-abc-123')).toBeDefined();
    });

    it.each([
      ['too long', 'a'.repeat(65)],
      ['with spaces', 'not a valid id'],
      ['with JSON characters', 'x"}{"level":60'],
    ])('replaces an incoming ID that is %s', async (_label, incoming) => {
      const res = await http()
        .get('/api/ping')
        .set(REQUEST_ID_HEADER, incoming);

      expect(res.headers['x-request-id']).toMatch(UUID);
    });

    it('is exposed to browsers through CORS', async () => {
      const res = await http()
        .get('/api/ping')
        .set('Origin', 'http://localhost:3000');

      expect(res.headers['access-control-expose-headers']).toContain(
        REQUEST_ID_HEADER,
      );
    });
  });

  describe('requestId in error bodies', () => {
    it('matches the response header', async () => {
      const res = await http().get('/api/does-not-exist').expect(404);

      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });

    // These fail in Express's body parser / URL decoding, before pino-http's
    // middleware runs; the filter must still assign an ID and log them.
    it.each([
      [
        'malformed JSON',
        () =>
          http()
            .post('/api')
            .set('Content-Type', 'application/json')
            .send('{"email":'),
        400,
      ],
      [
        'a too-large body',
        () =>
          http()
            .post('/api')
            .send({ padding: 'x'.repeat(200 * 1024) }),
        413,
      ],
    ])(
      'is set for %s, rejected before routing',
      async (_label, send, status) => {
        const res = await send().expect(status);
        const id = res.headers['x-request-id'];

        expect(id).toMatch(UUID);
        expect(res.body.error.requestId).toBe(id);
        expect(
          lines.find((line) => line.level === 40 && line.msg.includes(id)),
        ).toBeDefined();
      },
    );
  });

  describe('log lines', () => {
    it('writes one request line per request, with its outcome', async () => {
      const res = await http().get('/api/does-not-exist').expect(404);
      const line = requestLine(res.headers['x-request-id']);

      expect(line).toMatchObject({
        level: 40, // warn
        msg: 'request completed',
        req: { method: 'GET', url: '/api/does-not-exist' },
        res: { statusCode: 404 },
      });
    });

    it('ties the error log and the request line of a 500 to one request ID', async () => {
      const res = await http().get('/api/logging-test/crash').expect(500);
      const id = res.headers['x-request-id'];

      const filterLine = lines.find(
        (line) => line.context === 'AllExceptionsFilter' && line.level === 50,
      );
      expect(filterLine?.reqId).toBe(id);
      expect(requestLine(id)).toMatchObject({
        level: 50,
        res: { statusCode: 500 },
      });
      expect(res.body.error.requestId).toBe(id);
      // The real cause is in the logs, never in the response.
      expect(JSON.stringify(filterLine)).toContain('secret123');
      expect(JSON.stringify(res.body)).not.toContain('secret123');
    });

    it('redacts credentials', async () => {
      const res = await http()
        .get('/api/ping')
        .set('Authorization', 'Bearer secret-token')
        .set('Cookie', 'refresh_token=secret-cookie')
        .expect(200);

      const line = requestLine(res.headers['x-request-id']);
      expect(line?.req?.headers.authorization).toBe('[Redacted]');
      expect(line?.req?.headers.cookie).toBe('[Redacted]');
      expect(JSON.stringify(lines)).not.toMatch(/secret-token|secret-cookie/);
    });

    it('does not log health-check requests', async () => {
      await http().get('/health');

      expect(lines.filter((line) => line.req?.url === '/health')).toHaveLength(
        0,
      );
    });
  });
});
