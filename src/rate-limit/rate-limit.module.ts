import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

/**
 * RateLimitModule — the Redis-backed gateway rate limiter.
 * (Redis client comes from the global RedisModule.)
 */
@Module({
  imports: [OrganizationsModule], // for OrganizationsService.getRateLimit
  providers: [RateLimitService, RateLimitGuard],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule {}
