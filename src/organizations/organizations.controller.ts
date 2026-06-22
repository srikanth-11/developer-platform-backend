import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT } from '../audit/audit-event';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateRateLimitDto } from './dto/update-rate-limit.dto';
import { OrgRolesGuard } from './guards/org-roles.guard';
import { OrganizationsService } from './organizations.service';

/**
 * Two guards run on every route here, in order:
 *   1. JwtAuthGuard   — must be logged in (sets request.user)
 *   2. OrgRolesGuard  — for routes with @Roles, checks the user's role in the
 *                       target org (routes without @Roles pass straight through)
 *
 * Notice how clean the methods are now: authorization is declared with one
 * `@Roles(...)` line instead of being hand-written inside the service.
 */
@Controller('organizations')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly events: EventEmitter2,
  ) {}

  /** Create an org — no @Roles: any logged-in user may create one. */
  @Post()
  async create(@CurrentUser() user: User, @Body() dto: CreateOrganizationDto) {
    const org = await this.organizationsService.create(user.id, dto.name, dto.type);
    this.events.emit(AUDIT_EVENT, {
      action: 'organization.created',
      actorUserId: user.id,
      organizationId: org.id,
      targetType: 'organization',
      targetId: org.id,
      metadata: { name: org.name, type: org.type },
    });
    return org;
  }

  /** List my orgs — no @Roles: not scoped to a single org. */
  @Get()
  findMine(@CurrentUser() user: User) {
    return this.organizationsService.findMyOrganizations(user.id);
  }

  /** Read one org — any member (VIEWER and up). */
  @Get(':id')
  @Roles(Role.VIEWER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.organizationsService.findOne(id);
  }

  /** List members — any member (VIEWER and up). */
  @Get(':id/members')
  @Roles(Role.VIEWER)
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.organizationsService.listMembers(id);
  }

  /** Add a member — ADMIN and up (so OWNER and ADMIN qualify). */
  @Post(':id/members')
  @Roles(Role.ADMIN)
  async addMember(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteMemberDto,
  ) {
    const result = await this.organizationsService.addMember(id, dto);
    this.events.emit(AUDIT_EVENT, {
      action: 'member.added',
      actorUserId: user.id,
      organizationId: id,
      targetType: 'user',
      targetId: result.user.id,
      metadata: { role: dto.role, email: dto.email },
    });
    return result;
  }

  /** Change the org's plan / rate limit — OWNER only. */
  @Patch(':id/rate-limit')
  @Roles(Role.OWNER)
  async updateRateLimit(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRateLimitDto,
  ) {
    const result = await this.organizationsService.updateRateLimit(id, dto);
    this.events.emit(AUDIT_EVENT, {
      action: 'organization.plan_changed',
      actorUserId: user.id,
      organizationId: id,
      targetType: 'organization',
      targetId: id,
      metadata: result,
    });
    return result;
  }
}
