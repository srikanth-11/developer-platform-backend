import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

/** Parse a redis(s):// URL into BullMQ connection options (rediss => TLS). */
function connFromUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 6379,
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
  };
}
import { EmailsProcessor } from './processors/emails.processor';
import { EmailsProducer } from './producers/emails.producer';
import { QUEUES } from './queue.constants';

/**
 * QueueModule — BullMQ background-job infrastructure (backed by Redis).
 *
 * - `forRootAsync` sets the shared Redis connection used by ALL queues.
 * - `registerQueue` declares the 'emails' queue so it can be injected.
 * - Marked @Global so any module can use EmailsProducer without re-importing.
 *
 * BullMQ uses Redis to store jobs, so this is our second Redis-powered feature
 * (after rate limiting). The worker runs in-process here; in production you'd
 * often run workers as separate processes that scale independently.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redis.url');
        // A connection-string URL (Render Key Value / Upstash) wins; otherwise
        // use discrete host/port/password. rediss:// enables TLS automatically.
        return {
          connection: url
            ? connFromUrl(url)
            : {
                host: config.get<string>('redis.host'),
                port: config.get<number>('redis.port'),
                password: config.get<string>('redis.password'),
                tls: config.get<boolean>('redis.tls') ? {} : undefined,
              },
        };
      },
    }),
    BullModule.registerQueue({ name: QUEUES.EMAILS }),
  ],
  providers: [EmailsProducer, EmailsProcessor],
  exports: [EmailsProducer],
})
export class QueueModule {}
