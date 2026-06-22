import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Body for POST /organizations/:orgId/marketplace/apis. */
export class PublishApiDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @IsUrl(
    { require_tld: false, protocols: ['http', 'https'] },
    { message: 'baseUrl must be a valid http(s) URL' },
  )
  baseUrl: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  pricePerMonth?: number;
}
