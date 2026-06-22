import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { OrganizationType } from '../common/enums/organization-type.enum';
import { Plan, PLAN_RATE_LIMITS } from '../common/enums/plan.enum';
import { Role } from '../common/enums/role.enum';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { UsersService } from '../users/users.service';
import { UpdateRateLimitDto } from './dto/update-rate-limit.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { OrganizationMember } from './entities/organization-member.entity';
import { Organization } from './entities/organization.entity';

// Redis cache key holding an org's per-minute limit (read by the rate limiter).
const limitCacheKey = (orgId: string) => `rl:limit:${orgId}`;

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepo: Repository<OrganizationMember>,
    private readonly usersService: UsersService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Create an organization and make the creator its OWNER.
   *
   * Both writes (the org row AND the owner membership row) happen inside ONE
   * transaction: if either fails, neither is committed — we never end up with
   * an organization that has no owner.
   */
  async create(
    userId: string,
    name: string,
    type: OrganizationType,
  ): Promise<Organization> {
    const slug = await this.generateUniqueSlug(name);

    return this.orgRepo.manager.transaction(async (manager) => {
      const org = manager.create(Organization, { name, slug, type });
      await manager.save(org);

      const ownerMembership = manager.create(OrganizationMember, {
        organizationId: org.id,
        userId,
        role: Role.OWNER,
      });
      await manager.save(ownerMembership);

      return org;
    });
  }

  /** List every organization the user belongs to, with their role in each. */
  async findMyOrganizations(userId: string) {
    const memberships = await this.memberRepo.find({
      where: { userId },
      relations: { organization: true },
    });

    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      type: m.organization.type,
      role: m.role,
      joinedAt: m.createdAt,
    }));
  }

  /**
   * Return a single organization by id.
   *
   * Access control (is the caller a member?) is now enforced UPSTREAM by
   * OrgRolesGuard via `@Roles(...)`, so this method just loads data.
   */
  async findOne(orgId: string): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  /** Throw 403 unless the org is of the expected type (publisher/subscriber). */
  async assertType(orgId: string, expected: OrganizationType): Promise<void> {
    const org = await this.findOne(orgId);
    if (org.type !== expected) {
      const need = expected === OrganizationType.PUBLISHER ? 'publisher' : 'subscriber';
      throw new ForbiddenException(`This action requires a ${need} organization.`);
    }
  }

  /** List the members of an org (access enforced by the guard). */
  async listMembers(orgId: string) {
    const members = await this.memberRepo.find({
      where: { organizationId: orgId },
    });
    // user is eager-loaded; passwordHash is select:false so never present here.
    return members.map((m) => ({
      membershipId: m.id,
      role: m.role,
      user: {
        id: m.user.id,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
      },
      joinedAt: m.createdAt,
    }));
  }

  /**
   * Add an existing user to the org with a role.
   *
   * "Owner/admin only" is now enforced by the guard (`@Roles(Role.ADMIN)`).
   * What remains here is BUSINESS logic that the guard can't know about:
   *   - OWNER can't be granted via this endpoint (orgs get their owner at creation)
   *   - the invitee must be a registered user, and not already a member.
   */
  async addMember(orgId: string, dto: InviteMemberDto) {
    if (dto.role === Role.OWNER) {
      throw new ForbiddenException('Cannot assign the OWNER role');
    }

    const invitee = await this.usersService.findByEmail(dto.email);
    if (!invitee) {
      // Email invites for non-registered users need the notification system
      // (a later phase). For now the person must already have an account.
      throw new NotFoundException(
        'No registered user with that email. They must sign up first.',
      );
    }

    const already = await this.memberRepo.findOne({
      where: { organizationId: orgId, userId: invitee.id },
    });
    if (already) {
      throw new ConflictException('User is already a member of this org');
    }

    const membership = this.memberRepo.create({
      organizationId: orgId,
      userId: invitee.id,
      role: dto.role,
    });
    await this.memberRepo.save(membership);

    return {
      membershipId: membership.id,
      role: membership.role,
      user: {
        id: invitee.id,
        email: invitee.email,
        firstName: invitee.firstName,
        lastName: invitee.lastName,
      },
    };
  }

  /**
   * Helper: fetch the user's membership in an org or throw.
   * Reused by every method that needs "is this user allowed in this tenant?".
   */
  async getMembershipOrThrow(
    orgId: string,
    userId: string,
  ): Promise<OrganizationMember> {
    const membership = await this.memberRepo.findOne({
      where: { organizationId: orgId, userId },
    });
    if (!membership) {
      // 403 (not 404) — the user is authenticated but not allowed in this org.
      throw new ForbiddenException('You are not a member of this organization');
    }
    return membership;
  }

  // ---- Rate-limit / plan ----------------------------------------------------

  /** The org's effective per-minute request limit (read from the DB). */
  async getRateLimit(orgId: string): Promise<number> {
    const org = await this.orgRepo.findOne({
      where: { id: orgId },
      select: { id: true, requestsPerMinute: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org.requestsPerMinute;
  }

  /**
   * Update an org's plan / rate limit (owner only).
   *
   * Setting a fixed plan (free/pro) also sets `requestsPerMinute` from the plan
   * table; enterprise uses the explicit value. Afterwards we DELETE the Redis
   * cache key so the new limit takes effect immediately (write-through
   * invalidation) instead of waiting for the cache TTL to expire.
   */
  async updateRateLimit(orgId: string, dto: UpdateRateLimitDto) {
    const org = await this.findOne(orgId);

    if (dto.plan) {
      org.plan = dto.plan;
      if (dto.plan !== Plan.ENTERPRISE) {
        org.requestsPerMinute = PLAN_RATE_LIMITS[dto.plan];
      } else if (dto.requestsPerMinute != null) {
        org.requestsPerMinute = dto.requestsPerMinute;
      }
    } else if (dto.requestsPerMinute != null) {
      org.requestsPerMinute = dto.requestsPerMinute;
    }

    await this.orgRepo.save(org);
    await this.redis.del(limitCacheKey(orgId)); // invalidate cached limit

    return { plan: org.plan, requestsPerMinute: org.requestsPerMinute };
  }

  /** Turn a name into a unique URL slug ("Acme Corp" -> "acme-corp", "acme-corp-2"…). */
  private async generateUniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'org';

    let slug = base;
    let counter = 2;
    while (await this.orgRepo.exists({ where: { slug } })) {
      slug = `${base}-${counter}`;
      counter += 1;
    }
    return slug;
  }
}
