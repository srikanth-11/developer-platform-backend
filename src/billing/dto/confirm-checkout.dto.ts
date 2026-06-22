import { IsString } from 'class-validator';

/** Body for POST /organizations/:orgId/billing/checkout/confirm. */
export class ConfirmCheckoutDto {
  @IsString()
  sessionId: string;
}
