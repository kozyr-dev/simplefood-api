import { Controller, Get, UseFilters } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { HealthCheckFilter } from './health-check.filter';

@Controller('health')
@UseFilters(HealthCheckFilter)
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
