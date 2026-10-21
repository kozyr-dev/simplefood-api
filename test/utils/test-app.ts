import { Controller, Get, INestApplication, type Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

/** Test-only route: any test that needs "some endpoint that returns 200". */
@Controller('ping')
export class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

export interface TestAppOptions {
  /** Extra test-only controllers, registered next to PingController. */
  controllers?: Type[];
  /** Replace providers before compiling, e.g. `.overrideProvider(...)`. */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  /** Runs after the app is created, before configureApp() (e.g. to spy on config). */
  beforeConfigure?: (app: INestApplication<App>) => void;
}

/**
 * The real AppModule with the real HTTP pipeline (configureApp), exactly as
 * main.ts builds it, plus test-only controllers. Remember `await app.close()`.
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: [PingController, ...(options.controllers ?? [])],
  });
  const moduleFixture = await (
    options.override?.(builder) ?? builder
  ).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  options.beforeConfigure?.(app);
  configureApp(app);
  await app.init();
  return app;
}

/** A v4 UUID, as generated for request IDs. */
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
