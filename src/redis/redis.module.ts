import {
  Global,
  Inject,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * RedisModule — provides ONE shared ioredis connection for the whole app.
 *
 * Marked @Global so any module can inject `REDIS_CLIENT` without importing this
 * module (Redis is a cross-cutting infrastructure concern, like config).
 *
 * Redis is an in-memory data store. We use it here for:
 *   - rate-limit counters (this step) — fast atomic INCR, auto-expiring keys
 *   - caching the per-org limit (this step)
 * and later for queues (BullMQ, Phase 4).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          // Required by BullMQ later; harmless now. Lets commands wait instead
          // of erroring while reconnecting.
          maxRetriesPerRequest: null,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // Cleanly close the connection on shutdown (avoids dangling sockets).
  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
