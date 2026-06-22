import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import { SetFeatureFlagDto } from './dto/set-feature-flag.dto';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureGuard } from './guards/feature.guard';
import { RequireFeature } from './guards/require-feature.decorator';

/** Manage an org's feature flags. */
@Controller('organizations/:orgId/feature-flags')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  /** List every known flag + its effective state. */
  @Get()
  @Roles(Role.VIEWER)
  list(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.featureFlags.list(orgId);
  }

  /** Toggle a flag (ADMIN+). */
  @Patch(':key')
  @Roles(Role.ADMIN)
  set(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('key') key: string,
    @Body() dto: SetFeatureFlagDto,
  ) {
    return this.featureFlags.set(orgId, key, dto.enabled);
  }
}

/**
 * A demonstration of FEATURE GATING. This route is only reachable when the org
 * has `advanced_analytics` enabled — otherwise FeatureGuard returns 403. Toggle
 * the flag above to turn it on/off.
 */
@Controller('organizations/:orgId/advanced-analytics-demo')
@UseGuards(JwtAuthGuard, OrgRolesGuard, FeatureGuard)
export class AdvancedAnalyticsDemoController {
  @Get()
  @Roles(Role.VIEWER)
  @RequireFeature('advanced_analytics')
  get(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return {
      message: 'Advanced analytics is enabled for this org 🎉',
      organizationId: orgId,
    };
  }
}
