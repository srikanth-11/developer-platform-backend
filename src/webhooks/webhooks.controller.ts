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
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { WebhooksService } from './webhooks.service';

/**
 * Webhooks live under an org: /organizations/:orgId/webhooks
 * DEVELOPER+ manages them; ADMIN+ deletes; VIEWER+ reads.
 */
@Controller('organizations/:orgId/webhooks')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly events: EventEmitter2,
  ) {}

  @Post()
  @Roles(Role.DEVELOPER)
  async create(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateWebhookDto,
  ) {
    const webhook = await this.webhooksService.create(orgId, dto);
    this.events.emit(AUDIT_EVENT, {
      action: 'webhook.created',
      actorUserId: user.id,
      organizationId: orgId,
      targetType: 'webhook',
      targetId: webhook.id,
      metadata: { url: webhook.url, events: webhook.events },
    });
    return webhook;
  }

  @Get()
  @Roles(Role.VIEWER)
  findAll(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.webhooksService.findAll(orgId);
  }

  @Get(':id')
  @Roles(Role.DEVELOPER)
  findOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.webhooksService.findOne(orgId, id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.webhooksService.remove(orgId, id);
  }

  /** Fire a synthetic test event at this webhook. */
  @Post(':id/test')
  @Roles(Role.DEVELOPER)
  @HttpCode(HttpStatus.ACCEPTED)
  test(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.webhooksService.testWebhook(orgId, id);
  }

  /** The delivery log (attempts, status, responses) for this webhook. */
  @Get(':id/deliveries')
  @Roles(Role.VIEWER)
  deliveries(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.webhooksService.listDeliveries(orgId, id);
  }
}
