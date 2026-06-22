import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { STRIPE_WEBHOOK_EVENT } from './stripe-event';
import { StripeService } from './stripe.service';

/**
 * Stripe webhook receiver — PUBLIC (Stripe calls it unauthenticated) and NOT
 * org-scoped, so it lives in its own top-level controller at /api/billing/webhook.
 *
 * It verifies the signature using the RAW body (main.ts mounts `express.raw` for
 * this path), then fans the event out via EventEmitter so billing AND marketplace
 * can each handle the parts they own — without coupling those modules together.
 */
@Controller('billing')
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly events: EventEmitter2,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Req() req: Request, @Headers('stripe-signature') signature: string) {
    let event: Stripe.Event;
    try {
      // `req.body` is a Buffer here because of the raw body parser.
      event = this.stripe.constructEvent(req.body as Buffer, signature);
    } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed: ${String(err)}`);
    }

    try {
      // emitAsync awaits all @OnEvent listeners (billing + marketplace).
      await this.events.emitAsync(STRIPE_WEBHOOK_EVENT, event);
    } catch (err) {
      // Don't fail the webhook on a handler error — log and 200 so Stripe doesn't
      // hammer retries; the /confirm path is the safety net for the happy case.
      this.logger.error(`Error handling Stripe event ${event.type}: ${String(err)}`);
    }
    return { received: true };
  }
}
