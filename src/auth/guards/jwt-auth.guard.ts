import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Put `@UseGuards(JwtAuthGuard)` on any route that requires a logged-in user.
 *
 * It triggers the 'jwt' Passport strategy: no/invalid/expired token -> 401.
 * Valid token -> the user is attached to `request.user` and the handler runs.
 *
 * (In the RBAC step we'll layer a roles guard on top of this one.)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
