import { IsUUID } from 'class-validator';

/** Body for POST /organizations/:orgId/marketplace/subscriptions. */
export class SubscribeApiDto {
  @IsUUID()
  apiId: string;
}
