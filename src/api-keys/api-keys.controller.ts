import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT } from '../audit/audit-event';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import { User } from '../users/entities/user.entity';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

/**
 * API keys belong to an application, which belongs to an org. The route nests
 * all three: /organizations/:orgId/applications/:appId/api-keys
 *
 * Role policy (spec: "Developer: generate API keys"):
 *   - DEVELOPER and up: create / revoke / rotate
 *   - VIEWER and up:    list / view usage
 */
@Controller('organizations/:orgId/applications/:appId/api-keys')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly events: EventEmitter2,
  ) {}

  @Post()
  @Roles(Role.DEVELOPER)
  async create(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('appId', ParseUUIDPipe) appId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    const key = await this.apiKeysService.create(orgId, appId, dto);
    this.events.emit(AUDIT_EVENT, {
      action: 'apikey.created',
      actorUserId: user.id,
      organizationId: orgId,
      targetType: 'api_key',
      targetId: key.id,
      metadata: { name: key.name, applicationId: appId },
    });
    return key;
  }

  @Get()
  @Roles(Role.VIEWER)
  findAll(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('appId', ParseUUIDPipe) appId: string,
  ) {
    return this.apiKeysService.findAllForApp(orgId, appId);
  }

  @Get(':keyId')
  @Roles(Role.VIEWER)
  findOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('appId', ParseUUIDPipe) appId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ) {
    return this.apiKeysService.findOne(orgId, appId, keyId);
  }

  @Post(':keyId/revoke')
  @Roles(Role.DEVELOPER)
  @HttpCode(HttpStatus.OK)
  async revoke(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('appId', ParseUUIDPipe) appId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ) {
    const result = await this.apiKeysService.revoke(orgId, appId, keyId);
    this.events.emit(AUDIT_EVENT, {
      action: 'apikey.revoked',
      actorUserId: user.id,
      organizationId: orgId,
      targetType: 'api_key',
      targetId: keyId,
    });
    return result;
  }

  @Post(':keyId/rotate')
  @Roles(Role.DEVELOPER)
  @HttpCode(HttpStatus.OK)
  rotate(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('appId', ParseUUIDPipe) appId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ) {
    return this.apiKeysService.rotate(orgId, appId, keyId);
  }
}
