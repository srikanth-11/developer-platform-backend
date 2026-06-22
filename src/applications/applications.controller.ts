import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

/**
 * Applications live UNDER an organization, so the route is nested:
 *   /organizations/:orgId/applications
 *
 * OrgRolesGuard reads `:orgId` automatically, so every @Roles(...) here is
 * checked against the caller's role IN THAT org. Role policy (per the spec):
 *   - DEVELOPER and up: create / update apps & (later) keys
 *   - ADMIN and up:     delete apps ("manage APIs")
 *   - VIEWER and up:    read
 */
@Controller('organizations/:orgId/applications')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @Roles(Role.DEVELOPER)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationsService.create(orgId, dto);
  }

  @Get()
  @Roles(Role.VIEWER)
  findAll(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.applicationsService.findAllForOrg(orgId);
  }

  @Get(':id')
  @Roles(Role.VIEWER)
  findOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationsService.findOneOrThrow(orgId, id);
  }

  @Patch(':id')
  @Roles(Role.DEVELOPER)
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applicationsService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationsService.remove(orgId, id);
  }
}
