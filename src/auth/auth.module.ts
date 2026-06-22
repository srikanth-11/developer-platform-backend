import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ApplicationsModule } from '../applications/applications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    // Gives us the User repository/service for credential checks.
    UsersModule,
    // Auto-provision a workspace (org + default app) on registration.
    OrganizationsModule,
    ApplicationsModule,
    PassportModule,
    // JwtModule is configured asynchronously so the secret/expiry come from
    // validated config rather than being hard-coded.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          // jsonwebtoken types `expiresIn` as a number|template-literal; our
          // value arrives from config as a plain string, so we assert the type.
          expiresIn: config.get<string>(
            'jwt.expiresIn',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  // JwtStrategy is a provider so Passport can discover the 'jwt' strategy.
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
