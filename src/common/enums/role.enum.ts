/**
 * Per-ORGANIZATION roles.
 *
 * A user holds a role *within each organization they belong to* (stored on the
 * `organization_members` join table), NOT globally. The same person can be
 * OWNER of one org and VIEWER of another.
 *
 * Permission meaning (enforced fully by guards in Step 4 — RBAC):
 *   OWNER     full control, incl. billing & deleting the org
 *   ADMIN     manage members and APIs
 *   DEVELOPER create applications & API keys
 *   VIEWER    read-only
 */
export enum Role {
  OWNER = 'owner',
  ADMIN = 'admin',
  DEVELOPER = 'developer',
  VIEWER = 'viewer',
}

/**
 * Numeric RANK for each role — higher number = more power.
 *
 * This turns "Owner > Admin > Developer > Viewer" into something comparable, so
 * a guard can ask "is this user's rank >= the rank an endpoint requires?".
 * That's what makes `@Roles(Role.ADMIN)` admit OWNER too, without listing it.
 */
export const ROLE_RANK: Record<Role, number> = {
  [Role.VIEWER]: 0,
  [Role.DEVELOPER]: 1,
  [Role.ADMIN]: 2,
  [Role.OWNER]: 3,
};
