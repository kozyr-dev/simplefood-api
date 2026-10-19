import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * HTTP pipeline shared by main.ts and the e2e tests, so tests exercise the
 * exact routes and middleware production uses. Add helmet, ValidationPipe,
 * exception filters etc. here. Process-level concerns (shutdown hooks,
 * listen) stay in main.ts.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // Public API under /api; infrastructure probes (/health) stay at the root,
  // so load balancers and uptime checks don't depend on the API's URL layout.
  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim()),
  });
}
