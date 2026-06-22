import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { createHmac, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { QUEUES } from '../queue/queue.constants';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { Webhook } from './entities/webhook.entity';
import { DeliveryStatus } from './enums/delivery-status.enum';

// Job options shared by every delivery: 3 attempts, exponential backoff
// (1s, 2s). `removeOnFail: false` KEEPS failed jobs in Redis — that's our
// dead-letter queue, inspectable after the fact.
const DELIVERY_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: false,
};

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepo: Repository<Webhook>,
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectQueue(QUEUES.WEBHOOKS) private readonly queue: Queue,
  ) {}

  /** HMAC-SHA256 sign a payload with a webhook secret. Used by the processor. */
  static sign(secret: string, body: string): string {
    return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  }

  // ---- Management -----------------------------------------------------------

  async create(orgId: string, dto: CreateWebhookDto) {
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const webhook = await this.webhookRepo.save(
      this.webhookRepo.create({
        organizationId: orgId,
        url: dto.url,
        events: dto.events,
        description: dto.description ?? null,
        secret,
      }),
    );
    // Return the full secret at creation so the receiver can be configured.
    return { ...this.toResponse(webhook), secret };
  }

  async findAll(orgId: string) {
    const hooks = await this.webhookRepo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
    });
    return hooks.map((w) => this.toResponse(w));
  }

  /** Single webhook — includes the secret (the org needs it to verify signatures). */
  async findOne(orgId: string, id: string) {
    const webhook = await this.getOrThrow(orgId, id);
    return { ...this.toResponse(webhook), secret: webhook.secret };
  }

  async remove(orgId: string, id: string) {
    const webhook = await this.getOrThrow(orgId, id);
    await this.webhookRepo.remove(webhook);
    return { deleted: true, id };
  }

  // ---- Eventing -------------------------------------------------------------

  /**
   * Dispatch an event: record it, then fan out a delivery (and a queue job) to
   * every active webhook in the org subscribed to this event type.
   * Other modules call this to emit platform events.
   */
  async dispatchEvent(
    orgId: string,
    type: string,
    payload: Record<string, unknown>,
  ) {
    const event = await this.eventRepo.save(
      this.eventRepo.create({ organizationId: orgId, type, payload }),
    );

    const webhooks = await this.webhookRepo.find({
      where: { organizationId: orgId, isActive: true },
    });
    const matching = webhooks.filter(
      (w) => w.events.includes('*') || w.events.includes(type),
    );

    const deliveries: WebhookDelivery[] = [];
    for (const webhook of matching) {
      const delivery = await this.createDeliveryAndEnqueue(webhook.id, event);
      deliveries.push(delivery);
    }
    return { eventId: event.id, deliveries: deliveries.length };
  }

  /** Send a synthetic 'webhook.test' event to ONE webhook (the Test button). */
  async testWebhook(orgId: string, webhookId: string) {
    const webhook = await this.getOrThrow(orgId, webhookId);
    const event = await this.eventRepo.save(
      this.eventRepo.create({
        organizationId: orgId,
        type: 'webhook.test',
        payload: { message: 'This is a test event', webhookId: webhook.id },
      }),
    );
    const delivery = await this.createDeliveryAndEnqueue(webhook.id, event);
    return { eventId: event.id, deliveryId: delivery.id };
  }

  /** Delivery log for a webhook (newest first). */
  async listDeliveries(orgId: string, webhookId: string) {
    await this.getOrThrow(orgId, webhookId);
    return this.deliveryRepo.find({
      where: { webhookId, organizationId: orgId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  // ---- Internals ------------------------------------------------------------

  private async createDeliveryAndEnqueue(
    webhookId: string,
    event: WebhookEvent,
  ): Promise<WebhookDelivery> {
    const delivery = await this.deliveryRepo.save(
      this.deliveryRepo.create({
        webhookId,
        eventId: event.id,
        organizationId: event.organizationId,
        status: DeliveryStatus.PENDING,
      }),
    );
    await this.queue.add('deliver', { deliveryId: delivery.id }, DELIVERY_JOB_OPTS);
    return delivery;
  }

  private async getOrThrow(orgId: string, id: string): Promise<Webhook> {
    const webhook = await this.webhookRepo.findOne({
      where: { id, organizationId: orgId },
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }
    return webhook;
  }

  /** Masked view — never exposes the full secret in lists. */
  private toResponse(webhook: Webhook) {
    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      description: webhook.description,
      secretHint: `${webhook.secret.slice(0, 10)}…${webhook.secret.slice(-4)}`,
      createdAt: webhook.createdAt,
    };
  }
}
