import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { Application } from './entities/application.entity';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly appRepo: Repository<Application>,
  ) {}

  /** Create an application inside an organization. */
  async create(orgId: string, dto: CreateApplicationDto): Promise<Application> {
    const app = this.appRepo.create({
      name: dto.name,
      description: dto.description,
      organizationId: orgId,
    });
    return this.appRepo.save(app);
  }

  /** All applications belonging to an org. */
  findAllForOrg(orgId: string): Promise<Application[]> {
    return this.appRepo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Fetch one application, scoped to its org.
   *
   * The `organizationId` is part of the WHERE clause on PURPOSE: even though the
   * guard already proved the caller belongs to `orgId`, we must ensure THIS app
   * actually lives in THAT org. Otherwise a user who belongs to org A could read
   * app `X` from org B just by guessing its id. Tenant scoping at the data layer.
   */
  async findOneOrThrow(orgId: string, appId: string): Promise<Application> {
    const app = await this.appRepo.findOne({
      where: { id: appId, organizationId: orgId },
    });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    return app;
  }

  async update(
    orgId: string,
    appId: string,
    dto: UpdateApplicationDto,
  ): Promise<Application> {
    const app = await this.findOneOrThrow(orgId, appId);
    // Object.assign only copies the provided keys (undefined fields are skipped
    // by the DTO since they're absent), so this is a true partial update.
    Object.assign(app, dto);
    return this.appRepo.save(app);
  }

  async remove(orgId: string, appId: string): Promise<{ deleted: true; id: string }> {
    const app = await this.findOneOrThrow(orgId, appId);
    await this.appRepo.remove(app);
    return { deleted: true, id: appId };
  }
}
