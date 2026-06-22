import {
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Plan } from '../common/enums/plan.enum';
import { PLAN_TERMS } from './billing.constants';

/**
 * Thin wrapper around the Stripe SDK.
 *
 * Stripe is OPTIONAL: if no secret key is configured the service stays disabled
 * and any attempt to use it throws 501 (the rest of billing keeps working in
 * metering-only mode). This keeps local/dev environments runnable without keys.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  readonly enabled: boolean;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('stripe.secretKey') ?? '';
    this.webhookSecret = this.config.get<string>('stripe.webhookSecret') ?? '';
    this.enabled = secretKey.length > 0;
    this.stripe = this.enabled ? new Stripe(secretKey) : null;
    if (!this.enabled) {
      this.logger.warn(
        'Stripe is not configured (STRIPE_SECRET_KEY empty) — billing runs in metering-only mode.',
      );
    }
  }

  private client(): Stripe {
    if (!this.stripe) {
      throw new NotImplementedException(
        'Stripe is not configured on this server. Set STRIPE_SECRET_KEY to enable payments.',
      );
    }
    return this.stripe;
  }

  /** Create (or reuse) a Stripe Customer for an org. Returns the customer id. */
  async ensureCustomer(params: {
    orgId: string;
    existingCustomerId?: string | null;
    email?: string;
    name?: string;
  }): Promise<string> {
    if (params.existingCustomerId) return params.existingCustomerId;
    const customer = await this.client().customers.create({
      email: params.email,
      name: params.name,
      metadata: { orgId: params.orgId },
    });
    return customer.id;
  }

  /** A Checkout Session for the platform plan (Free/Pro/Enterprise). */
  createCheckoutSession(params: {
    customerId: string;
    orgId: string;
    plan: Plan;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    const terms = PLAN_TERMS[params.plan];
    return this.createSubscriptionCheckout({
      customerId: params.customerId,
      amountCents: Math.round(terms.pricePerMonth * 100),
      productName: `Developer Platform — ${params.plan} plan`,
      // `kind` lets the webhook fan-out route this to the billing handler.
      metadata: { kind: 'platform', orgId: params.orgId, plan: params.plan },
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    });
  }

  /** Generic recurring (monthly) Checkout Session — used by plans + marketplace. */
  createSubscriptionCheckout(params: {
    customerId: string;
    amountCents: number;
    productName: string;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
    // For marketplace payouts: route revenue to a connected account (the
    // publisher) and keep `applicationFeePercent` for the platform.
    transferDestination?: string;
    applicationFeePercent?: number;
  }): Promise<Stripe.Checkout.Session> {
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: params.metadata,
    };
    if (params.transferDestination) {
      subscriptionData.transfer_data = { destination: params.transferDestination };
      if (params.applicationFeePercent != null) {
        subscriptionData.application_fee_percent = params.applicationFeePercent;
      }
    }
    return this.client().checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            product_data: { name: params.productName },
            recurring: { interval: 'month' },
            unit_amount: params.amountCents,
          },
        },
      ],
      // Echo metadata on both the session and the resulting subscription so the
      // webhook/confirm can map back to our records.
      metadata: params.metadata,
      subscription_data: subscriptionData,
      success_url: `${params.successUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${params.cancelUrl}?checkout=cancel`,
    });
  }

  // ---- Stripe Connect (publisher payouts) ----

  /** Create an Express connected account for a publisher org. */
  async createConnectedAccount(orgId: string, email?: string): Promise<string> {
    const account = await this.client().accounts.create({
      type: 'express',
      email,
      metadata: { orgId },
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
    });
    return account.id;
  }

  /** An onboarding link for the connected account to complete Stripe's KYC flow. */
  async createAccountLink(params: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<Stripe.AccountLink> {
    return this.client().accountLinks.create({
      account: params.accountId,
      type: 'account_onboarding',
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
    });
  }

  /** Retrieve a connected account (to read `charges_enabled`). */
  retrieveAccount(accountId: string): Promise<Stripe.Account> {
    return this.client().accounts.retrieve(accountId);
  }

  /** A Billing Portal session (manage/cancel payment method + subscription). */
  async createPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<Stripe.BillingPortal.Session> {
    return this.client().billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
  }

  /** Retrieve a Checkout Session (with its subscription) — used by /confirm. */
  retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.client().checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.client().subscriptions.cancel(subscriptionId);
    } catch (err) {
      this.logger.warn(`Failed to cancel Stripe subscription ${subscriptionId}: ${String(err)}`);
    }
  }

  /** Verify + parse a webhook payload (raw Buffer + signature header). */
  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      throw new NotImplementedException('STRIPE_WEBHOOK_SECRET is not configured.');
    }
    return this.client().webhooks.constructEvent(payload, signature, this.webhookSecret);
  }
}
