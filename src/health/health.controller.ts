import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

/**
 * Health endpoint: GET /api/health
 *
 * A standard "is the service alive AND can it reach its dependencies?" probe.
 * Load balancers, Docker, Kubernetes and uptime monitors hit this. Right now it
 * just pings the database; we'll add Redis and queue checks in later phases.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // pingCheck runs a lightweight `SELECT 1` against Postgres.
      () => this.db.pingCheck('database'),
    ]);
  }
}
