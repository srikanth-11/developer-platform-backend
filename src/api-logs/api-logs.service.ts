import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiLog } from './entities/api-log.entity';

export interface RecordLogInput {
  requestId: string | null;
  organizationId: string | null;
  applicationId: string | null;
  apiKeyId: string | null;
  method: string;
  endpoint: string;
  statusCode: number;
  responseTimeMs: number;
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class ApiLogsService {
  private readonly logger = new Logger(ApiLogsService.name);

  constructor(
    @InjectRepository(ApiLog)
    private readonly logRepo: Repository<ApiLog>,
  ) {}

  /**
   * Persist a log row. Called fire-and-forget from the gateway middleware, so it
   * must NEVER throw into the request path — we swallow/log errors instead.
   * (A high-throughput gateway would push these to a queue and batch-insert;
   * that's exactly what BullMQ enables in Phase 4.)
   */
  async record(input: RecordLogInput): Promise<void> {
    try {
      await this.logRepo.insert(input);
    } catch (err) {
      // Logging must not break the actual API call.
      this.logger.error(`Failed to write api_log: ${(err as Error).message}`);
    }
  }

  /** Recent logs for an org (newest first) — powers the logs view + later analytics. */
  findRecentForOrg(organizationId: string, limit = 50): Promise<ApiLog[]> {
    return this.logRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }
}
