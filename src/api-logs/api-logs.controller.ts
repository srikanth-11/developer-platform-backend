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
import { ApiLogsService } from './api-logs.service';

/**
 * Read access to an org's request logs. Any member (VIEWER+) can read them.
 * GET /organizations/:orgId/logs?limit=50
 */
@Controller('organizations/:orgId/logs')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class ApiLogsController {
  constructor(private readonly apiLogsService: ApiLogsService) {}

  @Get()
  @Roles(Role.VIEWER)
  findRecent(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.apiLogsService.findRecentForOrg(orgId, limit);
  }
}
