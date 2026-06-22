import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'required_roles';

/**
 * `@Roles(Role.ADMIN)` — declare the MINIMUM organization role required to call
 * an endpoint.
 *
 * Semantics are HIERARCHICAL (see OrgRolesGuard): listing a role also admits
 * every higher role. So `@Roles(Role.DEVELOPER)` lets DEVELOPER, ADMIN and
 * OWNER through, but blocks VIEWER. `@Roles(Role.OWNER)` = owner only.
 *
 * This just attaches metadata; OrgRolesGuard reads it and does the enforcing.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
