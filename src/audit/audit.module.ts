import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuditController } from './audit.controller';
import { AuditListener } from './audit.listener';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

/**
 * AuditModule — owns the audit log + the listener that writes it.
 *
 * Note the dependency direction: AuditModule imports OrganizationsModule (for
 * the OrgRolesGuard on its read route), but NOTHING imports AuditModule. Emitters
 * talk to it only through EventEmitter2 + the AUDIT_EVENT contract, so there's no
 * module coupling and no circular dependency.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), OrganizationsModule],
  controllers: [AuditController],
  providers: [AuditService, AuditListener],
})
export class AuditModule {}
