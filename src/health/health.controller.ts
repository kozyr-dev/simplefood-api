import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  /**
   * 200 `{ status: 'ok' }` when every check passes, 503 otherwise.
   * Used by the Docker healthcheck and uptime monitoring.
   */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database').withTimeout(1500),
    ]);
  }
}
