import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { OrganizationMember } from '../../organizations/entities/organization-member.entity';

/**
 * `@CurrentMembership()` — the membership (incl. role) that OrgRolesGuard loaded
 * for this request. Lets a handler know "what role does the caller have here?"
 * without re-querying. Only present on routes guarded by OrgRolesGuard.
 */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrganizationMember => {
    return ctx.switchToHttp().getRequest().membership;
  },
);
