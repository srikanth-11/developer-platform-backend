import { IsBoolean } from 'class-validator';

/** Body for PATCH /organizations/:orgId/feature-flags/:key. */
export class SetFeatureFlagDto {
  @IsBoolean()
  enabled: boolean;
}
