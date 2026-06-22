import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import { AnalyticsService } from './analytics.service';

/**
 * Analytics dashboard data for an org. VIEWER+ (read-only insight).
 * All routes accept ?days=N (default 30).
 */
@Controller('organizations/:orgId/analytics')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @Roles(Role.VIEWER)
  overview(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.analyticsService.getOverview(orgId, days);
  }

  @Get('summary')
  @Roles(Role.VIEWER)
  summary(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.analyticsService.getSummary(orgId, days);
  }

  @Get('top-endpoints')
  @Roles(Role.VIEWER)
  topEndpoints(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.analyticsService.getTopEndpoints(orgId, days, limit);
  }

  @Get('daily')
  @Roles(Role.VIEWER)
  daily(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.analyticsService.getDaily(orgId, days);
  }
}
