import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim()),
  });

  // Run onModuleDestroy/onApplicationShutdown on SIGTERM/SIGINT (e.g. `docker stop`),
  // so DB connections close cleanly once TypeORM is added.
  app.enableShutdownHooks();

  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap();
