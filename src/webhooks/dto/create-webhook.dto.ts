import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/** Body for POST /organizations/:orgId/webhooks. */
export class CreateWebhookDto {
  // require_tld:false lets us point at http://localhost:PORT in development.
  @IsUrl(
    { require_tld: false, protocols: ['http', 'https'] },
    { message: 'url must be a valid http(s) URL' },
  )
  url: string;

  // Event types to subscribe to, e.g. ['apikey.created'] or ['*'] for all.
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
