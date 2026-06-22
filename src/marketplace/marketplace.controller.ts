import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { FeatureGuard } from '../feature-flags/guards/feature.guard';
import { RequireFeature } from '../feature-flags/guards/require-feature.decorator';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import { User } from '../users/entities/user.entity';
import { ConfirmSubscriptionDto } from './dto/confirm-subscription.dto';
import { PublishApiDto } from './dto/publish-api.dto';
import { SubscribeApiDto } from './dto/subscribe-api.dto';
import { MarketplaceService } from './marketplace.service';

/**
 * Org-scoped marketplace actions. Publishing and subscribing are GATED behind
 * the `api_marketplace` feature flag (Step 20) — a real example of selling a
 * capability per-tenant.
 */
@Controller('organizations/:orgId/marketplace')
@UseGuards(JwtAuthGuard, OrgRolesGuard, FeatureGuard)
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  /** Publish an API (feature-gated, DEVELOPER+). */
  @Post('apis')
  @Roles(Role.DEVELOPER)
  @RequireFeature('api_marketplace')
  publish(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: PublishApiDto,
  ) {
    return this.marketplace.publish(orgId, dto);
  }

  /** APIs this org has published (no feature gate — just reading own data). */
  @Get('apis')
  @Roles(Role.VIEWER)
  listOwned(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.marketplace.listOwned(orgId);
  }

  /** Payout readiness for this org as a publisher (VIEWER+). */
  @Get('connect/status')
  @Roles(Role.VIEWER)
  connectStatus(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.marketplace.connectStatus(orgId);
  }

  /** Recurring earnings from this org's published APIs (VIEWER+). */
  @Get('earnings')
  @Roles(Role.VIEWER)
  earnings(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.marketplace.getEarnings(orgId);
  }

  /** Start Stripe Connect payout onboarding (ADMIN+) → returns a redirect URL. */
  @Post('connect/onboard')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  connectOnboard(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.marketplace.connectOnboard(orgId, user);
  }

  /**
   * Subscribe this org to a published API (feature-gated, DEVELOPER+).
   * Returns `{ url }` (redirect to Stripe) for a paid API, or `{ subscribed }`
   * when it's free / Stripe is disabled.
   */
  @Post('subscriptions')
  @Roles(Role.DEVELOPER)
  @RequireFeature('api_marketplace')
  subscribe(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: SubscribeApiDto,
  ) {
    return this.marketplace.subscribe(orgId, user, dto.apiId);
  }

  /** Confirm a returned paid-subscription Checkout Session (DEVELOPER+). */
  @Post('subscriptions/confirm')
  @Roles(Role.DEVELOPER)
  confirmSubscription(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: ConfirmSubscriptionDto,
  ) {
    return this.marketplace.confirmSubscription(orgId, dto.sessionId);
  }

  @Get('subscriptions')
  @Roles(Role.VIEWER)
  listSubscriptions(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.marketplace.listSubscriptions(orgId);
  }

  @Delete('subscriptions/:id')
  @Roles(Role.DEVELOPER)
  unsubscribe(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.marketplace.unsubscribe(orgId, id);
  }
}

/**
 * The PUBLIC catalog — any logged-in user can browse published APIs (not
 * org-scoped, no feature gate). This is the "storefront".
 */
@Controller('marketplace')
@UseGuards(JwtAuthGuard)
export class MarketplaceCatalogController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('apis')
  browse(@Query('category') category?: string) {
    return this.marketplace.browse(category);
  }

  @Get('apis/:id')
  details(@Param('id', ParseUUIDPipe) id: string) {
    return this.marketplace.getPublished(id);
  }
}
