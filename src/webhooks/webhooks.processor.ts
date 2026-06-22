import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { WEBHOOK_FAILED_EVENT } from '../notifications/notification-events';
import { QUEUES } from '../queue/queue.constants';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { Webhook } from './entities/webhook.entity';
import { DeliveryStatus } from './enums/delivery-status.enum';
import { WebhooksService } from './webhooks.service';

const HTTP_TIMEOUT_MS = 8000;

interface DeliverJobData {
  deliveryId: string;
}

/**
 * WebhooksProcessor — the worker that actually delivers events over HTTP.
 *
 * For each job it: loads the delivery/webhook/event, builds + SIGNS the payload,
 * POSTs it, and records the result. If the receiver doesn't return 2xx (or the
 * request errors), it THROWS so BullMQ retries with backoff. When all retries
 * are exhausted, the `failed` handler marks the delivery DEAD (dead-letter).
 */
@Processor(QUEUES.WEBHOOKS)
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectRepository(Webhook)
    private readonly webhookRepo: Repository<Webhook>,
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<DeliverJobData>): Promise<unknown> {
    const { deliveryId } = job.data;

    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) return; // delivery was deleted
    if (delivery.status === DeliveryStatus.SUCCESS) return; // idempotent

    const webhook = await this.webhookRepo.findOne({
      where: { id: delivery.webhookId },
    });
    const event = await this.eventRepo.findOne({
      where: { id: delivery.eventId },
    });
    if (!webhook || !event) {
      delivery.status = DeliveryStatus.DEAD;
      delivery.lastError = 'webhook or event no longer exists';
      await this.deliveryRepo.save(delivery);
      return;
    }

    // Build the canonical payload and sign it. The receiver recomputes the HMAC
    // with the shared secret over the EXACT body to verify authenticity.
    const body = JSON.stringify({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt,
      data: event.payload,
    });
    const signature = WebhooksService.sign(webhook.secret, body);

    delivery.attempts += 1;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DeveloperPlatform-Webhooks/1.0',
          'X-Webhook-Id': webhook.id,
          'X-Webhook-Event': event.type,
          'X-Webhook-Delivery': delivery.id,
          'X-Webhook-Signature': signature,
        },
        body,
        signal: controller.signal,
      });

      delivery.responseStatus = res.status;
      delivery.responseBody = (await res.text().catch(() => '')).slice(0, 2000);

      if (res.ok) {
        delivery.status = DeliveryStatus.SUCCESS;
        delivery.deliveredAt = new Date();
        delivery.lastError = null;
        await this.deliveryRepo.save(delivery);
        this.logger.log(`✅ delivery ${deliveryId} -> HTTP ${res.status}`);
        return { status: res.status };
      }

      // Non-2xx: record and throw to trigger a retry.
      delivery.status = DeliveryStatus.FAILED;
      delivery.lastError = `HTTP ${res.status}`;
      await this.deliveryRepo.save(delivery);
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Network error / timeout (no HTTP response captured above).
      if (delivery.responseStatus == null) {
        delivery.status = DeliveryStatus.FAILED;
        delivery.lastError = (err as Error).message;
        await this.deliveryRepo.save(delivery);
      }
      throw err; // let BullMQ retry
    } finally {
      clearTimeout(timer);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<DeliverJobData>, err: Error) {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      // Retries exhausted → dead-letter. The job itself also stays in Redis's
      // `bull:webhooks:failed` set (removeOnFail:false) for inspection/replay.
      await this.deliveryRepo.update(
        { id: job.data.deliveryId },
        { status: DeliveryStatus.DEAD },
      );
      this.logger.warn(
        `☠️  delivery ${job.data.deliveryId} dead-lettered after ${job.attemptsMade} attempts: ${err.message}`,
      );
      // Notify the org that a webhook is failing (decoupled — we just emit;
      // the notifications module reacts).
      const delivery = await this.deliveryRepo.findOne({
        where: { id: job.data.deliveryId },
      });
      if (delivery) {
        this.events.emit(WEBHOOK_FAILED_EVENT, {
          organizationId: delivery.organizationId,
          webhookId: delivery.webhookId,
          deliveryId: delivery.id,
          error: err.message,
        });
      }
    } else {
      this.logger.warn(
        `↻ delivery ${job.data.deliveryId} attempt ${job.attemptsMade} failed (${err.message}); retrying`,
      );
    }
  }
}
