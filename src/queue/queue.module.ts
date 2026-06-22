import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUES.EMAILS }),
  ],
  providers: [EmailsProducer, EmailsProcessor],
  exports: [EmailsProducer],
})
export class QueueModule {}
