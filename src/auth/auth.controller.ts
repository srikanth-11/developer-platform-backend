import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AUDIT_EVENT } from '../audit/audit-event';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// ThrottlerGuard caps requests per IP on these auth routes — a brute-force
// defence for login/register (the gateway has its own limit; the dashboard
// auth endpoints needed one too).
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly events: EventEmitter2,
  ) {}

  /** POST /api/auth/register */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** POST /api/auth/login */
  @Post('login')
  // Default for POST is 201 Created; login isn't creating anything, so 200 OK.
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto);
    // Platform-level event (no org context).
    this.events.emit(AUDIT_EVENT, {
      action: 'user.login',
      actorUserId: result.user.id,
      organizationId: null,
      targetType: 'user',
      targetId: result.user.id,
    });
    return result;
  }

  /**
   * GET /api/auth/me — returns the currently authenticated user.
   * Protected: requires a valid `Authorization: Bearer <token>` header.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
