import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type Stripe from 'stripe';
import { STRIPE_WEBHOOK_EVENT } from './stripe-event';
import { Between, Repository } from 'typeorm';
import { ApiLog } from '../api-logs/entities/api-log.entity';
import { Plan } from '../common/enums/plan.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { PLAN_TERMS } from './billing.constants';
import { BillingRecord } from './entities/billing-record.entity';
import { Subscription } from './entities/subscription.entity';
import { StripeService } from './stripe.service';

/** What the controller needs to create a Stripe customer for an org. */
export interface BillingActor {
  email: string;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(BillingRecord)
    private readonly recordRepo: Repository<BillingRecord>,
    @InjectRepository(ApiLog)
    private readonly logRepo: Repository<ApiLog>,
    private readonly organizationsService: OrganizationsService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  get paymentsEnabled(): boolean {
    return this.stripe.enabled;
  }

  /** [start, end) of the current calendar month (UTC). */
  private currentPeriod(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return { start, end };
  }

  /** Get the org's subscription, lazily creating a FREE one if none exists. */
  async ensureSubscription(orgId: string): Promise<Subscription> {
    let sub = await this.subRepo.findOne({ where: { organizationId: orgId } });
    if (!sub) {
      sub = await this.applyPlan(orgId, Plan.FREE);
    }
    return sub;
  }

  /** Subscribe/change plan: updates the subscription AND the rate limit. */
  async subscribe(orgId: string, plan: Plan): Promise<Subscription> {
    return this.applyPlan(orgId, plan);
  }

  private async applyPlan(orgId: string, plan: Plan): Promise<Subscription> {
    const terms = PLAN_TERMS[plan];
    const { start, end } = this.currentPeriod();

    let sub = await this.subRepo.findOne({ where: { organizationId: orgId } });
    if (!sub) sub = this.subRepo.create({ organizationId: orgId });
    sub.plan = plan;
    sub.status = 'active';
    sub.monthlyQuota = terms.monthlyQuota;
    sub.pricePerMonth = terms.pricePerMonth.toFixed(2);
    sub.overagePerThousand = terms.overagePerThousand.toFixed(4);
    sub.currentPeriodStart = start;
    sub.currentPeriodEnd = end;
    await this.subRepo.save(sub);

    // Keep the gateway rate limit in sync with the billed plan (reuses Step 9).
    await this.organizationsService.updateRateLimit(orgId, { plan });

    return sub;
  }

  /** Live usage + projected cost for the current period (computed from api_logs). */
  async getUsage(orgId: string) {
    const sub = await this.ensureSubscription(orgId);
    const used = await this.logRepo.count({
      where: {
        organizationId: orgId,
        createdAt: Between(sub.currentPeriodStart, sub.currentPeriodEnd),
      },
    });

    return this.computeBill(sub, used);
  }

  /** Close the current period into an immutable invoice (billing_record). */
  async closeInvoice(orgId: string): Promise<BillingRecord> {
    const sub = await this.ensureSubscription(orgId);
    const used = await this.logRepo.count({
      where: {
        organizationId: orgId,
        createdAt: Between(sub.currentPeriodStart, sub.currentPeriodEnd),
      },
    });
    const bill = this.computeBill(sub, used);

    const record = this.recordRepo.create({
      organizationId: orgId,
      plan: sub.plan,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      includedRequests: bill.includedRequests,
      usedRequests: bill.usedRequests,
      overageRequests: bill.overageRequests,
      baseCost: bill.baseCost.toFixed(2),
      overageCost: bill.overageCost.toFixed(2),
      totalCost: bill.totalCost.toFixed(2),
      status: 'open',
    });
    return this.recordRepo.save(record);
  }

  listInvoices(orgId: string): Promise<BillingRecord[]> {
    return this.recordRepo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
    });
  }

  subscriptionView(sub: Subscription) {
    return {
      plan: sub.plan,
      status: sub.status,
      monthlyQuota: Number(sub.monthlyQuota),
      pricePerMonth: Number(sub.pricePerMonth),
      overagePerThousand: Number(sub.overagePerThousand),
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
    };
  }

  /** The core money math: included vs used → overage → cost. */
  private computeBill(sub: Subscription, used: number) {
    const included = Number(sub.monthlyQuota);
    const pricePerMonth = Number(sub.pricePerMonth);
    const overagePerThousand = Number(sub.overagePerThousand);

    const overage = Math.max(0, used - included);
    // Billed per started 1,000-request block.
    const overageUnits = Math.ceil(overage / 1000);
    const overageCost = overageUnits * overagePerThousand;
    const totalCost = pricePerMonth + overageCost;

    return {
      plan: sub.plan,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      includedRequests: included,
      usedRequests: used,
      overageRequests: overage,
      baseCost: pricePerMonth,
      overageCost: Number(overageCost.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
    };
  }

  // ===== Stripe payments =====

  /**
   * Start a plan change.
   *  - FREE  → cancel any paid Stripe subscription and downgrade immediately.
   *  - PAID  → return a Stripe Checkout URL for the frontend to redirect to.
   * The plan only becomes active once payment succeeds (via /confirm or webhook).
   */
  async createCheckout(
    orgId: string,
    actor: BillingActor,
    plan: Plan,
  ): Promise<{ url: string | null; downgraded?: boolean }> {
    const sub = await this.ensureSubscription(orgId);

    if (plan === Plan.FREE) {
      if (sub.stripeSubscriptionId) {
        await this.stripe.cancelSubscription(sub.stripeSubscriptionId);
      }
      const updated = await this.applyPlan(orgId, Plan.FREE);
      updated.stripeSubscriptionId = null;
      await this.subRepo.save(updated);
      return { url: null, downgraded: true };
    }

    const customerId = await this.ensureStripeCustomer(orgId, actor);
    const dashboard = `${this.config.get<string>('frontendUrl')}/billing`;
    const session = await this.stripe.createCheckoutSession({
      customerId,
      orgId,
      plan,
      successUrl: dashboard,
      cancelUrl: dashboard,
    });
    return { url: session.url };
  }

  /** A Stripe Billing Portal URL (manage card / cancel). */
  async createPortal(orgId: string): Promise<{ url: string }> {
    const sub = await this.ensureSubscription(orgId);
    if (!sub.stripeCustomerId) {
      throw new BadRequestException('No billing account yet — subscribe to a paid plan first.');
    }
    const session = await this.stripe.createPortalSession({
      customerId: sub.stripeCustomerId,
      returnUrl: `${this.config.get<string>('frontendUrl')}/billing`,
    });
    return { url: session.url };
  }

  // ----- Stripe Connect (publisher payouts) -----

  /** Get/create the org's connected (Express) account for receiving payouts. */
  async ensureConnectAccount(orgId: string, actor: BillingActor): Promise<string> {
    const sub = await this.ensureSubscription(orgId);
    if (sub.stripeConnectAccountId) return sub.stripeConnectAccountId;
    const accountId = await this.stripe.createConnectedAccount(orgId, actor.email);
    sub.stripeConnectAccountId = accountId;
    await this.subRepo.save(sub);
    return accountId;
  }

  /** A Stripe onboarding link for the publisher to complete payout setup. */
  async getConnectOnboardingLink(orgId: string, actor: BillingActor): Promise<{ url: string }> {
    const accountId = await this.ensureConnectAccount(orgId, actor);
    const ret = `${this.config.get<string>('frontendUrl')}/payouts`;
    const link = await this.stripe.createAccountLink({
      accountId,
      refreshUrl: `${ret}?connect=refresh`,
      returnUrl: `${ret}?connect=done`,
    });
    return { url: link.url };
  }

  /**
   * Payout readiness for an org (publisher).
   *
   * Readiness is based on the **transfers** capability, not `charges_enabled`:
   * marketplace revenue reaches publishers via destination-charge *transfers*, so
   * the publisher only needs to be able to RECEIVE transfers — they're not taking
   * direct card charges themselves. Requiring `charges_enabled` would force them
   * through full merchant onboarding they don't need.
   */
  async getConnectStatus(
    orgId: string,
  ): Promise<{ connected: boolean; payoutsReady: boolean; accountId: string | null }> {
    const sub = await this.subRepo.findOne({ where: { organizationId: orgId } });
    if (!sub?.stripeConnectAccountId) {
      return { connected: false, payoutsReady: false, accountId: null };
    }
    try {
      const account = await this.stripe.retrieveAccount(sub.stripeConnectAccountId);
      const payoutsReady = account.capabilities?.transfers === 'active';
      // Keep the cached flag in sync on read (works even without webhooks).
      if (sub.payoutsEnabled !== payoutsReady) {
        sub.payoutsEnabled = payoutsReady;
        await this.subRepo.save(sub);
      }
      return { connected: true, payoutsReady, accountId: sub.stripeConnectAccountId };
    } catch {
      return {
        connected: true,
        payoutsReady: sub.payoutsEnabled,
        accountId: sub.stripeConnectAccountId,
      };
    }
  }

  /**
   * Confirm a completed Checkout Session on return from Stripe. Lets the happy
   * path work WITHOUT the Stripe CLI/webhooks during local development; webhooks
   * remain the source of truth in production.
   */
  async confirmCheckout(orgId: string, sessionId: string): Promise<Subscription> {
    const session = await this.stripe.retrieveCheckoutSession(sessionId);
    if (session.metadata?.orgId !== orgId) {
      throw new BadRequestException('Checkout session does not belong to this organization.');
    }
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      throw new BadRequestException('Payment not completed.');
    }
    const plan = session.metadata?.plan as Plan;
    const customerId = this.idOf(session.customer);
    const subscriptionId = this.idOf(session.subscription);
    return this.activateFromStripe(orgId, plan, customerId, subscriptionId);
  }

  /** Handle a verified Stripe webhook event (platform-plan events only). */
  @OnEvent(STRIPE_WEBHOOK_EVENT, { async: true })
  async handleStripeEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        // Marketplace checkouts are handled by MarketplaceService — skip them.
        if (s.metadata?.kind === 'marketplace') break;
        const orgId = s.metadata?.orgId;
        const plan = s.metadata?.plan as Plan | undefined;
        if (orgId && plan) {
          await this.activateFromStripe(orgId, plan, this.idOf(s.customer), this.idOf(s.subscription));
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const s = event.data.object as Stripe.Subscription;
        const sub = await this.subRepo.findOne({ where: { stripeSubscriptionId: s.id } });
        if (sub) {
          const downgraded = await this.applyPlan(sub.organizationId, Plan.FREE);
          downgraded.stripeSubscriptionId = null;
          await this.subRepo.save(downgraded);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const s = event.data.object as Stripe.Subscription;
        const sub = await this.subRepo.findOne({ where: { stripeSubscriptionId: s.id } });
        if (sub) {
          sub.status = s.status === 'active' ? 'active' : s.status === 'past_due' ? 'past_due' : sub.status;
          await this.subRepo.save(sub);
        }
        break;
      }
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice;
        await this.recordPaidInvoice(inv);
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const subId = this.invoiceSubscriptionId(inv);
        if (subId) {
          const sub = await this.subRepo.findOne({ where: { stripeSubscriptionId: subId } });
          if (sub) {
            sub.status = 'past_due';
            await this.subRepo.save(sub);
          }
        }
        break;
      }
      case 'account.updated': {
        // A publisher's connected account changed (e.g. onboarding finished) —
        // refresh the cached payout-ready flag without anyone loading the page.
        const account = event.data.object as Stripe.Account;
        const sub = await this.subRepo.findOne({
          where: { stripeConnectAccountId: account.id },
        });
        if (sub) {
          sub.payoutsEnabled = account.capabilities?.transfers === 'active';
          await this.subRepo.save(sub);
        }
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  /** Public: get/create the org's single Stripe customer (shared with marketplace). */
  ensureCustomer(orgId: string, actor: BillingActor): Promise<string> {
    return this.ensureStripeCustomer(orgId, actor);
  }

  private async ensureStripeCustomer(orgId: string, actor: BillingActor): Promise<string> {
    const sub = await this.ensureSubscription(orgId);
    if (sub.stripeCustomerId) return sub.stripeCustomerId;
    const customerId = await this.stripe.ensureCustomer({
      orgId,
      email: actor.email,
      name: [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email,
    });
    sub.stripeCustomerId = customerId;
    await this.subRepo.save(sub);
    return customerId;
  }

  private async activateFromStripe(
    orgId: string,
    plan: Plan,
    customerId: string | null,
    subscriptionId: string | null,
  ): Promise<Subscription> {
    const sub = await this.applyPlan(orgId, plan);
    if (customerId) sub.stripeCustomerId = customerId;
    if (subscriptionId) sub.stripeSubscriptionId = subscriptionId;
    sub.status = 'active';
    return this.subRepo.save(sub);
  }

  /** The subscription id an invoice belongs to (shape varies across Stripe API versions). */
  private invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
    const raw = (inv as unknown as { subscription?: string | { id: string } | null })
      .subscription;
    return this.idOf(raw ?? null);
  }

  /** Snapshot a paid PLATFORM-PLAN invoice into an immutable billing_record. */
  private async recordPaidInvoice(inv: Stripe.Invoice): Promise<void> {
    const subId = this.invoiceSubscriptionId(inv);
    if (!subId) return;
    // Only platform-plan invoices have a matching subscription row; marketplace
    // invoices won't match and are ignored here.
    const sub = await this.subRepo.findOne({ where: { stripeSubscriptionId: subId } });
    if (!sub) return;
    const amount = (inv.amount_paid ?? 0) / 100;
    const record = this.recordRepo.create({
      organizationId: sub.organizationId,
      plan: sub.plan,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      includedRequests: Number(sub.monthlyQuota),
      usedRequests: 0,
      overageRequests: 0,
      baseCost: amount.toFixed(2),
      overageCost: '0.00',
      totalCost: amount.toFixed(2),
      status: 'paid',
    });
    await this.recordRepo.save(record);
  }

  /** Stripe fields are `string | {id} | null` depending on expansion. */
  private idOf(v: string | { id: string } | null | undefined): string | null {
    if (!v) return null;
    return typeof v === 'string' ? v : v.id;
  }
}
