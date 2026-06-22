import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

/**
 * MonitoringService — owns the Prometheus metrics registry.
 *
 * This is OPERATIONAL observability (how healthy is the SERVER?), as opposed to
 * the per-tenant business analytics in Step 14 (how is each CUSTOMER using the
 * API?). Prometheus scrapes `/metrics`; Grafana graphs it.
 *
 * We expose:
 *   - default process metrics (CPU, memory, event-loop lag, GC) via
 *     collectDefaultMetrics,
 *   - http_requests_total (counter) and http_request_duration_seconds
 *     (histogram), labelled by method/route/status.
 */
@Injectable()
export class MonitoringService {
  private readonly registry = new Registry();
  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;

  constructor() {
    this.registry.setDefaultLabels({ app: 'developer-platform' });
    // Node/process metrics out of the box.
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      // Buckets tuned for a fast API (5ms … 5s).
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
  }

  /** Record one finished request. `route` MUST be a low-cardinality pattern. */
  observe(method: string, route: string, status: number, durationSec: number) {
    const labels = { method, route, status: String(status) };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, durationSec);
  }

  /** Prometheus exposition text for the /metrics endpoint. */
  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
