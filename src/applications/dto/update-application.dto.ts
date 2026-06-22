import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Body for PATCH /organizations/:orgId/applications/:id.
 *
 * Every field is optional — a PATCH updates only what's provided. (We write this
 * by hand instead of pulling in @nestjs/mapped-types' PartialType to avoid an
 * extra dependency and keep the validation rules explicit.)
 */
export class UpdateApplicationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
