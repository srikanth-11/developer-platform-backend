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
import { AuditService } from './audit.service';

/**
 * GET /organizations/:orgId/audit-logs — the org's audit trail.
 * ADMIN+ only: an audit trail is sensitive (it reveals who did what).
 */
@Controller('organizations/:orgId/audit-logs')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(Role.ADMIN)
  findForOrg(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.auditService.findForOrg(orgId, limit);
  }
}
