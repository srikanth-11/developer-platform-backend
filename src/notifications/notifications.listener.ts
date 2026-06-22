import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChannelType } from './enums/channel-type.enum';
import {
  RATELIMIT_EXCEEDED_EVENT,
  WEBHOOK_FAILED_EVENT,
} from './notification-events';
// type-only: used as decorated handler params (isolatedModules requirement).
import type {
  RateLimitExceededPayload,
  WebhookFailedPayload,
} from './notification-events';
import { NotificationsService } from './notifications.service';

/**
 * NotificationsListener — maps domain events to notifications.
 *
 * The webhooks and rate-limit modules just EMIT events; they don't know
 * notifications exist. This listener decides which channels each event goes out
 * on. Add/route channels here without touching the emitters.
 */
@Injectable()
export class NotificationsListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(WEBHOOK_FAILED_EVENT, { async: true })
  async onWebhookFailed(payload: WebhookFailedPayload): Promise<void> {
    await this.notifications.notify({
      organizationId: payload.organizationId,
      type: 'webhook.failed',
      title: 'Webhook delivery failed',
      message: `Delivery ${payload.deliveryId} to webhook ${payload.webhookId} failed after retries (${payload.error}).`,
      channels: [ChannelType.EMAIL, ChannelType.SLACK],
      metadata: { ...payload },
    });
  }

  @OnEvent(RATELIMIT_EXCEEDED_EVENT, { async: true })
  async onRateLimitExceeded(payload: RateLimitExceededPayload): Promise<void> {
    await this.notifications.notify({
      organizationId: payload.organizationId,
      type: 'ratelimit.exceeded',
      title: 'API rate limit reached',
      message: `Your organization hit its limit of ${payload.limit} requests/minute.`,
      channels: [ChannelType.EMAIL],
      metadata: { ...payload },
    });
  }
}
