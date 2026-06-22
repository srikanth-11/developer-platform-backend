import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiLog } from '../api-logs/entities/api-log.entity';

/**
 * AnalyticsService — turns the raw `api_logs` event stream (Step 10) into
 * dashboard metrics using Postgres aggregation.
 *
 * We compute on-demand with SQL (GROUP BY, FILTER, percentile, date_trunc).
 * That's perfect up to large volumes; beyond that you'd pre-aggregate into a
 * rollup table with a scheduled BullMQ job — the raw queries here are the
 * reference the rollup would reproduce.
 *
 * Note the column names: the gateway logger wrote snake_case (`status_code`,
 * `response_time_ms`) but the base entity uses quoted camelCase (`"createdAt"`,
 * `"organizationId"`), so the raw SQL mixes both deliberately.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(ApiLog)
    private readonly logRepo: Repository<ApiLog>,
  ) {}

  private since(days: number): Date {
    const clamped = Math.min(Math.max(days, 1), 365);
    return new Date(Date.now() - clamped * 24 * 60 * 60 * 1000);
  }

  /** Headline numbers: totals, success/failure, error rate, latency. */
  async getSummary(orgId: string, days: number) {
    const [row] = await this.logRepo.query(
      `SELECT
         COUNT(*)::int                                            AS total,
         COUNT(*) FILTER (WHERE status_code < 400)::int           AS successful,
         COUNT(*) FILTER (WHERE status_code >= 400)::int          AS failed,
         COALESCE(ROUND(AVG(response_time_ms)::numeric, 2), 0)    AS avg_ms,
         COALESCE(ROUND((PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms))::numeric, 2), 0) AS p95_ms,
         COALESCE(MAX(response_time_ms), 0)                       AS max_ms
       FROM api_logs
       WHERE "organizationId" = $1 AND "createdAt" >= $2`,
      [orgId, this.since(days)],
    );

    const total = Number(row.total);
    const failed = Number(row.failed);
    return {
      rangeDays: days,
      totalRequests: total,
      successfulRequests: Number(row.successful),
      failedRequests: failed,
      errorRate: total ? Number((failed / total).toFixed(4)) : 0,
      avgResponseMs: Number(row.avg_ms),
      p95ResponseMs: Number(row.p95_ms),
      maxResponseMs: Number(row.max_ms),
    };
  }

  /** Most-hit endpoints, with their traffic, latency and error counts. */
  async getTopEndpoints(orgId: string, days: number, limit = 10) {
    const rows = await this.logRepo.query(
      `SELECT endpoint, method,
              COUNT(*)::int                                     AS count,
              COALESCE(ROUND(AVG(response_time_ms)::numeric, 2), 0) AS avg_ms,
              COUNT(*) FILTER (WHERE status_code >= 400)::int   AS errors
       FROM api_logs
       WHERE "organizationId" = $1 AND "createdAt" >= $2
       GROUP BY endpoint, method
       ORDER BY count DESC
       LIMIT $3`,
      [orgId, this.since(days), Math.min(Math.max(limit, 1), 100)],
    );
    return rows.map((r: Record<string, string>) => ({
      endpoint: r.endpoint,
      method: r.method,
      count: Number(r.count),
      avgResponseMs: Number(r.avg_ms),
      errors: Number(r.errors),
    }));
  }

  /** Requests per day (time series for charts). */
  async getDaily(orgId: string, days: number) {
    const rows = await this.logRepo.query(
      `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
              COUNT(*)::int                                   AS total,
              COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors,
              COALESCE(ROUND(AVG(response_time_ms)::numeric, 2), 0) AS avg_ms
       FROM api_logs
       WHERE "organizationId" = $1 AND "createdAt" >= $2
       GROUP BY day
       ORDER BY day ASC`,
      [orgId, this.since(days)],
    );
    return rows.map((r: Record<string, string>) => ({
      day: r.day,
      total: Number(r.total),
      errors: Number(r.errors),
      avgResponseMs: Number(r.avg_ms),
    }));
  }

  /** Everything a dashboard needs in one call. */
  async getOverview(orgId: string, days: number) {
    const [summary, topEndpoints, daily] = await Promise.all([
      this.getSummary(orgId, days),
      this.getTopEndpoints(orgId, days, 5),
      this.getDaily(orgId, days),
    ]);
    return { summary, topEndpoints, daily };
  }
}
