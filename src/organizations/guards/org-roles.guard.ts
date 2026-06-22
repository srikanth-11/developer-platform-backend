import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { Role, ROLE_RANK } from '../../common/enums/role.enum';
import { OrganizationsService } from '../organizations.service';

// Where in the request we might find the organization id, in priority order.
// Supports both `/organizations/:id` and nested `/.../:orgId/...` routes.
const ORG_ID_PARAMS = ['organizationId', 'orgId', 'id'];

/**
 * OrgRolesGuard — enforces the `@Roles(...)` requirement for organization-scoped
 * routes. Runs AFTER JwtAuthGuard (so `request.user` already exists).
 *
 * Flow:
 *   1. Read the required roles from metadata. None? → allow (route isn't gated).
 *   2. Figure out which organization the request targets (from route params/body).
 *   3. Load the user's membership in that org (403 if they're not a member).
 *   4. Compare ranks: user's role must be >= the lowest required role's rank.
 *   5. Attach the membership to `request.membership` so handlers can reuse it
 *      WITHOUT querying again.
 */
@Injectable()
export class OrgRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles on this route → nothing to enforce here.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      // Means JwtAuthGuard didn't run first — a wiring mistake, not a client error.
      throw new ForbiddenException('Authentication required');
    }

    const orgId = this.extractOrgId(request);
    if (!orgId) {
      throw new BadRequestException('Organization id is required for this route');
    }
    // Guards run BEFORE param pipes (like ParseUUIDPipe), so we must validate the
    // id format here ourselves — otherwise a malformed id reaches the DB query
    // below and Postgres throws a 500 on "invalid input syntax for type uuid".
    if (!isUUID(orgId)) {
      throw new BadRequestException('Invalid organization id');
    }

    // Throws 403 if the user isn't a member of this org (the tenant boundary).
    const membership = await this.organizationsService.getMembershipOrThrow(
      orgId,
      user.id,
    );

    // The endpoint's bar = the LOWEST rank among the listed roles (most permissive).
    const requiredRank = Math.min(...requiredRoles.map((r) => ROLE_RANK[r]));
    if (ROLE_RANK[membership.role] < requiredRank) {
      throw new ForbiddenException(
        `Requires at least the '${this.roleForRank(requiredRank)}' role`,
      );
    }

    // Make the membership available to controllers/services downstream.
    request.membership = membership;
    return true;
  }

  private extractOrgId(request: {
    params?: Record<string, string>;
    body?: Record<string, unknown>;
  }): string | undefined {
    for (const key of ORG_ID_PARAMS) {
      const fromParams = request.params?.[key];
      if (fromParams) return fromParams;
    }
    const fromBody = request.body?.organizationId;
    return typeof fromBody === 'string' ? fromBody : undefined;
  }

  private roleForRank(rank: number): Role {
    return (Object.keys(ROLE_RANK) as Role[]).find(
      (role) => ROLE_RANK[role] === rank,
    ) as Role;
  }
}
