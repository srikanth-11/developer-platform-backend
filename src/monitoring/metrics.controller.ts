import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MonitoringService } from './monitoring.service';

/**
 * GET /metrics — the Prometheus scrape endpoint.
 *
 * It's EXCLUDED from the global `/api` prefix (see main.ts) so Prometheus can
 * hit the conventional `/metrics` path. We use @Res to write the raw exposition
 * text with Prometheus's content-type (and to bypass the JSON serialization).
 *
 * No auth: a metrics endpoint is normally network-restricted (scraped internally)
 * rather than token-protected. In production you'd firewall it or bind it to an
 * internal interface.
 */
@Controller()
export class MetricsController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get('metrics')
  async metrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.monitoring.contentType);
    res.send(await this.monitoring.metrics());
  }
}
