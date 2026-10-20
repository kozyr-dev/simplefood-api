import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Security headers, /api prefix, CORS, pipes and filters: see app.setup.ts.
  configureApp(app);

  // Run onModuleDestroy/onApplicationShutdown on SIGTERM/SIGINT (e.g. `docker stop`),
  // so DB connections close cleanly.
  app.enableShutdownHooks();

  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}
void bootstrap();
