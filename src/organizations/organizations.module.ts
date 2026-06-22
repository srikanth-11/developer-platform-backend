import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { OrganizationMember } from './entities/organization-member.entity';
import { Organization } from './entities/organization.entity';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrgRolesGuard } from './guards/org-roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, OrganizationMember]),
    // For looking up invited users by email.
    UsersModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrgRolesGuard],
  // Export both so later modules (Applications, etc.) can reuse the membership
  // check AND apply the same org-role guard to their own routes.
  exports: [OrganizationsService, OrgRolesGuard],
})
export class OrganizationsModule {}
