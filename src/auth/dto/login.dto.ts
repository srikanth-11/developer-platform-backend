import { IsEmail, IsString, MinLength } from 'class-validator';

/** Shape + validation for POST /auth/login. */
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password: string;
}
