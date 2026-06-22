import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Body for POST /…/applications/:appId/api-keys. */
export class CreateApiKeyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  /**
   * Optional lifetime in days. Omit for a non-expiring key.
   * Bounded to avoid silly values (max ~10 years).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}
