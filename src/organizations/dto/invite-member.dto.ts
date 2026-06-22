import { IsEmail, IsEnum } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

/**
 * Body for POST /organizations/:id/members.
 *
 * For now we add an ALREADY-REGISTERED user by email. True email invitations to
 * people who don't have an account yet need the notification system, which
 * arrives in a later phase — noted in the service.
 */
export class InviteMemberDto {
  @IsEmail()
  email: string;

  // Must be one of the Role enum values. The service additionally forbids
  // assigning OWNER through this endpoint.
  @IsEnum(Role, {
    message: `role must be one of: ${Object.values(Role).join(', ')}`,
  })
  role: Role;
}
