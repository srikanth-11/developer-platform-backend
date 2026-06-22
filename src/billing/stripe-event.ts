/**
 * Internal event emitted by the Stripe webhook controller after it verifies a
 * payload. Both BillingService (platform plans) and MarketplaceService (paid API
 * subscriptions) listen via @OnEvent and handle the event types they own — this
 * fan-out keeps the two modules decoupled (no circular dependency).
 */
export const STRIPE_WEBHOOK_EVENT = 'stripe.webhook';
