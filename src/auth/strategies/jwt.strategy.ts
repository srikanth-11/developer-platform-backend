import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';

/**
 * The data we encode inside the JWT. `sub` (subject) is the standard JWT claim
 * for "who this token belongs to" — here, the user id.
 */
export interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * JwtStrategy runs on every request guarded by JwtAuthGuard.
 *
 * Passport extracts the token from the `Authorization: Bearer <token>` header,
 * verifies its signature with our secret, and (if valid) calls `validate()`
 * with the decoded payload. Whatever `validate()` returns is attached to
 * `request.user`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret') as string,
    });
  }

  async validate(payload: JwtPayload) {
    // We re-load the user from the DB so a token for a deleted/deactivated
    // account is rejected even if the token itself hasn't expired.
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User no longer active');
    }
    // This object becomes `request.user`.
    return user;
  }
}
