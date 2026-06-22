import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OrganizationType } from '../../common/enums/organization-type.enum';

/**
 * Shape + validation rules for POST /auth/register.
 *
 * The global ValidationPipe (configured in main.ts) runs these decorators
 * automatically and returns 400 with clear messages if the body is invalid.
 */
export class RegisterDto {
  @IsEmail({}, { message: 'A valid email is required' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  // 72 is bcrypt's hard limit — bytes beyond it are silently ignored, so we
  // reject longer passwords up front to avoid a confusing security footgun.
  password: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  // Whether this account publishes APIs or subscribes to them. Chosen at signup,
  // drives the auto-created workspace's type and the dashboard the user sees.
  @IsEnum(OrganizationType, {
    message: `type must be one of: ${Object.values(OrganizationType).join(', ')}`,
  })
  type: OrganizationType;
}
