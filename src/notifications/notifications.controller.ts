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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import { TestNotificationDto } from './dto/test-notification.dto';
import { NotificationsService } from './notifications.service';

/** /organizations/:orgId/notifications */
@Controller('organizations/:orgId/notifications')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Send a test notification across the chosen channels (ADMIN+). */
  @Post('test')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  test(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: TestNotificationDto,
  ) {
    return this.notifications.notify({
      organizationId: orgId,
      type: 'test',
      title: dto.title,
      message: dto.message,
      channels: dto.channels,
    });
  }

  /** Notification history for the org (VIEWER+). */
  @Get()
  @Roles(Role.VIEWER)
  list(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.notifications.findForOrg(orgId);
  }
}
