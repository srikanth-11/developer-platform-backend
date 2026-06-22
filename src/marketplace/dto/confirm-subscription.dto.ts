import { IsString } from 'class-validator';

/** Body for POST /organizations/:orgId/marketplace/subscriptions/confirm. */
export class ConfirmSubscriptionDto {
  @IsString()
  sessionId: string;
}
