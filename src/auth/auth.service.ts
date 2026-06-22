import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { ApplicationsService } from '../applications/applications.service';
import { OrganizationType } from '../common/enums/organization-type.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { EmailsProducer } from '../queue/producers/emails.producer';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';

// Cost factor for bcrypt. Higher = slower = harder to brute-force. 10–12 is the
// common sweet spot for interactive logins.
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailsProducer: EmailsProducer,
    private readonly organizationsService: OrganizationsService,
    private readonly applicationsService: ApplicationsService,
  ) {}

  /** Register a new user, then immediately log them in (return a token). */
  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      // Don't reveal much — but a duplicate email is fine to report.
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    // Auto-provision the user's workspace so there's no separate "create
    // organization / application" step. One org of the chosen type; subscribers
    // also get a default application that their API keys live under.
    const workspaceName = `${user.firstName || dto.email.split('@')[0]}'s workspace`;
    const org = await this.organizationsService.create(user.id, workspaceName, dto.type);
    if (dto.type === OrganizationType.SUBSCRIBER) {
      await this.applicationsService.create(org.id, {
        name: 'Default',
        description: 'Default application for your API keys.',
      });
    }

    // Enqueue a welcome email and move on — we DON'T await any sending here, so
    // registration stays fast even if the mail provider is slow. The worker
    // handles delivery (and retries) in the background.
    await this.emailsProducer.enqueueWelcomeEmail({
      email: user.email,
      name: user.firstName,
    });

    return this.buildAuthResponse(user);
  }

  /** Verify credentials and return a token. */
  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    // Use the SAME error whether the email is unknown or the password is wrong,
    // so an attacker can't tell which emails are registered (user enumeration).
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    return this.buildAuthResponse(user);
  }

  /** Sign a JWT for the user and return it alongside a safe user view. */
  private buildAuthResponse(user: User) {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      user: this.sanitize(user),
    };
  }

  /** Strip the password hash before sending a user back over the API. */
  private sanitize(user: User) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
