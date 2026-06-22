import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { RATELIMIT_EXCEEDED_EVENT } from '../notifications/notification-events';
import { OrganizationsService } from '../organizations/organizations.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

export interface RateLimitResult {
  limit: number;
  count: number;
  remaining: number;
  allowed: boolean;
  resetAtEpoch: number; // unix seconds when the window resets
  retryAfter: number; // seconds until reset
}

const WINDOW_SECONDS = 60;

/**
 * RateLimitService — a FIXED-WINDOW rate limiter backed by Redis.
 *
 * For each minute window we keep a counter in Redis and INCR it on every
 * request. Redis is ideal here because:
 *   - INCR is atomic, so concurrent requests count correctly,
 *   - keys can auto-EXPIRE, so old windows clean themselves up,
 *   - it's shared across app instances (a limit must hold cluster-wide, which
 *     an in-memory counter can't do).
 *
 * We count PER ORGANIZATION (the plan belongs to the org), so all of an org's
 * API keys share its quota — matching the Free/Pro/Enterprise model.
 */
@Injectable()
export class RateLimitService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly organizationsService: OrganizationsService,
    private readonly events: EventEmitter2,
  ) {}

  async consume(orgId: string): Promise<RateLimitResult> {
    const limit = await this.getLimit(orgId);

    const now = Date.now();
    const windowId = Math.floor(now / (WINDOW_SECONDS * 1000));
    const counterKey = `rl:count:${orgId}:${windowId}`;

    // INCR returns the new value. On the first hit of a window we set the TTL so
    // the counter disappears when the window ends.
    const count = await this.redis.incr(counterKey);
    if (count === 1) {
      await this.redis.expire(counterKey, WINDOW_SECONDS);
    }

    // Emit exactly ONCE per window — the first request that breaches the limit
    // (count === limit + 1) — so we notify without spamming on every rejection.
    if (count === limit + 1) {
      this.events.emit(RATELIMIT_EXCEEDED_EVENT, { organizationId: orgId, limit });
    }
    // (Edge case: a crash between INCR and EXPIRE could orphan a key for one
    // window. A production system uses a Lua script to make the two atomic.)

    const resetAtEpoch = (windowId + 1) * WINDOW_SECONDS;
    return {
      limit,
      count,
      remaining: Math.max(0, limit - count),
      allowed: count <= limit,
      resetAtEpoch,
      retryAfter: Math.max(0, resetAtEpoch - Math.floor(now / 1000)),
    };
  }

  /**
   * The org's limit, CACHED in Redis for the window length to avoid a DB hit on
   * every single gateway request. (Owner updates invalidate this key, so changes
   * apply immediately.)
   */
  private async getLimit(orgId: string): Promise<number> {
    const cacheKey = `rl:limit:${orgId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return parseInt(cached, 10);
    }
    const limit = await this.organizationsService.getRateLimit(orgId);
    await this.redis.set(cacheKey, String(limit), 'EX', WINDOW_SECONDS);
    return limit;
  }
}
