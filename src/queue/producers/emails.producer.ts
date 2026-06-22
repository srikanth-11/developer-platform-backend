import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUES } from '../queue.constants';

/**
 * EmailsProducer — the PRODUCER side of the emails queue. Other modules call
 * this to *enqueue* work; they don't do (or wait for) the work themselves.
 *
 * Enqueuing returns almost instantly — the actual "sending" happens later in a
 * worker. That's the whole point of a queue: get slow/awaitable work OFF the
 * request path so the HTTP response stays fast.
 */
@Injectable()
export class EmailsProducer {
  constructor(@InjectQueue(QUEUES.EMAILS) private readonly queue: Queue) {}

  async enqueueWelcomeEmail(data: {
    email: string;
    name?: string;
  }): Promise<string> {
    const job = await this.queue.add('welcome', data, {
      // Retry up to 3 times with EXPONENTIAL backoff (2s, 4s, 8s) if the worker
      // throws — transient failures (e.g. mail provider hiccup) self-heal.
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      // House-keeping: keep a bounded history instead of growing Redis forever.
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    return job.id as string;
  }
}
