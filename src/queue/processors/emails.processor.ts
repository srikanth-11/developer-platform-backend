import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queue.constants';

/**
 * EmailsProcessor — the WORKER side of the emails queue.
 *
 * @Processor(QUEUES.EMAILS) registers a BullMQ worker that pulls jobs off the
 * 'emails' queue and runs `process()`. It runs in the background, independent of
 * any HTTP request. If `process()` throws, BullMQ retries per the job's
 * `attempts`/`backoff` settings.
 */
@Processor(QUEUES.EMAILS)
export class EmailsProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailsProcessor.name);

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'welcome':
        return this.handleWelcome(job);
      default:
        this.logger.warn(`Unknown email job type: ${job.name}`);
        return null;
    }
  }

  private async handleWelcome(job: Job<{ email: string; name?: string }>) {
    const { email, name } = job.data;
    // Simulated send — real SMTP/provider integration arrives in Step 16.
    this.logger.log(
      `📧 [job ${job.id}] Sending welcome email to ${email}${name ? ` (${name})` : ''}`,
    );
    return { sent: true, to: email };
  }

  // ---- Worker lifecycle events (observability) -----------------------------

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`✅ job ${job.id} (${job.name}) completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.warn(
      `❌ job ${job.id} (${job.name}) attempt ${job.attemptsMade} failed: ${err.message}`,
    );
  }
}
