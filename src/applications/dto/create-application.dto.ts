import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Body for POST /organizations/:orgId/applications. */
export class CreateApplicationDto {
  @IsString()
  @MinLength(2, { message: 'Application name must be at least 2 characters' })
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
