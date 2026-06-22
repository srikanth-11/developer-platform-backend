import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type Stripe from 'stripe';
import { Repository } from 'typeorm';
import { type BillingActor, BillingService } from '../billing/billing.service';
import { STRIPE_WEBHOOK_EVENT } from '../billing/stripe-event';
import { StripeService } from '../billing/stripe.service';
import { OrganizationType } from '../common/enums/organization-type.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { PublishApiDto } from './dto/publish-api.dto';
import { MarketplaceApi } from './entities/marketplace-api.entity';
import { MarketplaceSubscription } from './entities/marketplace-subscription.entity';
import { ApiStatus, ApiVisibility } from './enums/marketplace.enums';

/** The platform's cut of each marketplace subscription (the rest goes to the publisher). */
const PLATFORM_FEE_PERCENT = 10;

@Injectable()
export class MarketplaceService {
  constructor(
    @InjectRepository(MarketplaceApi)
    private readonly apiRepo: Repository<MarketplaceApi>,
    @InjectRepository(MarketplaceSubscription)
    private readonly subRepo: Repository<MarketplaceSubscription>,
    private readonly billing: BillingService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
    private readonly organizations: OrganizationsService,
  ) {}

  // ---- Publishing -----------------------------------------------------------

  async publish(orgId: string, dto: PublishApiDto) {
    await this.organizations.assertType(orgId, OrganizationType.PUBLISHER);
    const slug = await this.uniqueSlug(dto.name);
    const api = this.apiRepo.create({
      ownerOrganizationId: orgId,
      name: dto.name,
      slug,
      description: dto.description ?? null,
      category: dto.category ?? null,
      version: dto.version ?? 'v1',
      baseUrl: dto.baseUrl,
      visibility: ApiVisibility.PUBLIC,
      status: ApiStatus.PUBLISHED,
      pricePerMonth: (dto.pricePerMonth ?? 0).toFixed(2),
    });
    return this.view(await this.apiRepo.save(api));
  }

  async listOwned(orgId: string) {
    const apis = await this.apiRepo.find({
      where: { ownerOrganizationId: orgId },
      order: { createdAt: 'DESC' },
    });
    return apis.map((a) => this.view(a));
  }

  // ---- Discovery (catalog) --------------------------------------------------

  async browse(category?: string) {
    const where: Record<string, unknown> = {
      status: ApiStatus.PUBLISHED,
      visibility: ApiVisibility.PUBLIC,
    };
    if (category) where.category = category;
    const apis = await this.apiRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return apis.map((a) => this.view(a));
  }

  async getPublished(id: string) {
    const api = await this.apiRepo.findOne({
      where: { id, status: ApiStatus.PUBLISHED },
    });
    if (!api) throw new NotFoundException('API not found');
    return this.view(api);
  }

  // ---- Subscribing ----------------------------------------------------------

  /**
   * Subscribe to a published API.
   *  - Free API (or Stripe disabled) → activate immediately.
   *  - Paid API with Stripe enabled  → return a Checkout URL; the subscription is
   *    only created once payment succeeds (via /confirm or the webhook).
   */
  async subscribe(orgId: string, actor: BillingActor, apiId: string) {
    await this.organizations.assertType(orgId, OrganizationType.SUBSCRIBER);
    const api = await this.apiRepo.findOne({
      where: { id: apiId, status: ApiStatus.PUBLISHED },
    });
    if (!api) throw new NotFoundException('Published API not found');

    const existing = await this.subRepo.findOne({
      where: { subscriberOrganizationId: orgId, apiId },
    });
    if (existing) {
      throw new ConflictException('Already subscribed to this API');
    }

    const price = Number(api.pricePerMonth);
    if (price <= 0 || !this.stripe.enabled) {
      // Free (or demo mode) → instant access grant.
      const sub = await this.subRepo.save(
        this.subRepo.create({ subscriberOrganizationId: orgId, apiId }),
      );
      return { subscribed: true, subscriptionId: sub.id, api: this.view(api) };
    }

    // Paid → the publisher must be able to receive payouts (Stripe Connect).
    const payout = await this.billing.getConnectStatus(api.ownerOrganizationId);
    if (!payout.payoutsReady || !payout.accountId) {
      throw new BadRequestException(
        "This API's publisher hasn't finished setting up payouts yet, so it can't be subscribed to.",
      );
    }

    // Off to Stripe Checkout — revenue is routed to the publisher's connected
    // account, minus the platform fee.
    const customerId = await this.billing.ensureCustomer(orgId, actor);
    const dashboard = `${this.config.get<string>('frontendUrl')}/marketplace`;
    const session = await this.stripe.createSubscriptionCheckout({
      customerId,
      amountCents: Math.round(price * 100),
      productName: `Marketplace — ${api.name}`,
      metadata: { kind: 'marketplace', subscriberOrgId: orgId, apiId },
      successUrl: dashboard,
      cancelUrl: dashboard,
      transferDestination: payout.accountId,
      applicationFeePercent: PLATFORM_FEE_PERCENT,
    });
    return { url: session.url };
  }

  // ---- Publisher payouts (Stripe Connect) ----

  /** Start payout onboarding for this org as a publisher → returns a Stripe URL. */
  async connectOnboard(orgId: string, actor: BillingActor) {
    await this.organizations.assertType(orgId, OrganizationType.PUBLISHER);
    return this.billing.getConnectOnboardingLink(orgId, actor);
  }

  /** Is this org payout-ready (can earn from published APIs)? */
  connectStatus(orgId: string) {
    return this.billing.getConnectStatus(orgId);
  }

  /**
   * Recurring earnings for a publisher org: active subscriptions to its published
   * APIs × each API's monthly price, minus the platform fee. Computed from our own
   * records (not Stripe) so it works in demo mode too.
   */
  async getEarnings(orgId: string) {
    const apis = await this.apiRepo.find({ where: { ownerOrganizationId: orgId } });
    const feeRate = PLATFORM_FEE_PERCENT / 100;

    let totalSubscribers = 0;
    let grossMonthly = 0;
    const perApi = [];
    for (const api of apis) {
      const subscribers = await this.subRepo.count({
        where: { apiId: api.id, status: 'active' },
      });
      const price = Number(api.pricePerMonth);
      const gross = price * subscribers;
      totalSubscribers += subscribers;
      grossMonthly += gross;
      perApi.push({
        id: api.id,
        name: api.name,
        pricePerMonth: price,
        subscribers,
        grossMonthly: Number(gross.toFixed(2)),
        netMonthly: Number((gross * (1 - feeRate)).toFixed(2)),
      });
    }

    const platformFee = Number((grossMonthly * feeRate).toFixed(2));
    return {
      currency: 'usd',
      platformFeePercent: PLATFORM_FEE_PERCENT,
      publishedApis: apis.length,
      totalSubscribers,
      grossMonthly: Number(grossMonthly.toFixed(2)),
      platformFee,
      netMonthly: Number((grossMonthly - platformFee).toFixed(2)),
      perApi: perApi.sort((a, b) => b.grossMonthly - a.grossMonthly),
    };
  }

  /** Confirm a returned marketplace Checkout Session (works without the CLI). */
  async confirmSubscription(orgId: string, sessionId: string) {
    const session = await this.stripe.retrieveCheckoutSession(sessionId);
    if (session.metadata?.kind !== 'marketplace' || session.metadata?.subscriberOrgId !== orgId) {
      throw new BadRequestException('Checkout session does not belong to this organization.');
    }
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      throw new BadRequestException('Payment not completed.');
    }
    const apiId = session.metadata.apiId;
    const stripeSubscriptionId = this.idOf(session.subscription);
    return this.activateSubscription(orgId, apiId, stripeSubscriptionId);
  }

  /** Idempotently create the subscription row (used by /confirm and the webhook). */
  private async activateSubscription(
    orgId: string,
    apiId: string,
    stripeSubscriptionId: string | null,
  ) {
    let sub = await this.subRepo.findOne({
      where: { subscriberOrganizationId: orgId, apiId },
    });
    if (!sub) {
      sub = this.subRepo.create({ subscriberOrganizationId: orgId, apiId });
    }
    sub.status = 'active';
    sub.stripeSubscriptionId = stripeSubscriptionId;
    return this.subRepo.save(sub);
  }

  /** Handle the marketplace slices of a verified Stripe webhook. */
  @OnEvent(STRIPE_WEBHOOK_EVENT, { async: true })
  async handleStripeEvent(event: Stripe.Event): Promise<void> {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.kind !== 'marketplace') return;
      const orgId = s.metadata.subscriberOrgId;
      const apiId = s.metadata.apiId;
      if (orgId && apiId) {
        await this.activateSubscription(orgId, apiId, this.idOf(s.subscription));
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const s = event.data.object as Stripe.Subscription;
      const sub = await this.subRepo.findOne({ where: { stripeSubscriptionId: s.id } });
      if (sub) {
        sub.status = 'canceled';
        await this.subRepo.save(sub);
      }
    }
  }

  private idOf(v: string | { id: string } | null | undefined): string | null {
    if (!v) return null;
    return typeof v === 'string' ? v : v.id;
  }

  async listSubscriptions(orgId: string) {
    const subs = await this.subRepo.find({
      where: { subscriberOrganizationId: orgId },
      order: { createdAt: 'DESC' },
    });
    // Join the API details for each subscription.
    const result = [];
    for (const sub of subs) {
      const api = await this.apiRepo.findOne({ where: { id: sub.apiId } });
      result.push({
        subscriptionId: sub.id,
        status: sub.status,
        api: api ? this.view(api) : null,
        subscribedAt: sub.createdAt,
      });
    }
    return result;
  }

  async unsubscribe(orgId: string, subscriptionId: string) {
    const sub = await this.subRepo.findOne({
      where: { id: subscriptionId, subscriberOrganizationId: orgId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    // Stop billing the subscriber if this was a paid subscription.
    if (sub.stripeSubscriptionId) {
      await this.stripe.cancelSubscription(sub.stripeSubscriptionId);
    }
    await this.subRepo.remove(sub);
    return { unsubscribed: true, id: subscriptionId };
  }

  // ---- Internals ------------------------------------------------------------

  private view(api: MarketplaceApi) {
    return {
      id: api.id,
      name: api.name,
      slug: api.slug,
      description: api.description,
      category: api.category,
      version: api.version,
      baseUrl: api.baseUrl,
      pricePerMonth: Number(api.pricePerMonth),
      ownerOrganizationId: api.ownerOrganizationId,
      status: api.status,
      publishedAt: api.createdAt,
    };
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'api';
    let slug = base;
    let n = 2;
    while (await this.apiRepo.exists({ where: { slug } })) {
      slug = `${base}-${n++}`;
    }
    return slug;
  }
}
