import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Plan } from '../../common/enums/plan.enum';

/** Body for PATCH /organizations/:id/rate-limit (owner only). */
export class UpdateRateLimitDto {
  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;

  // Used directly, or as the custom value for the Enterprise plan.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  requestsPerMinute?: number;
}
