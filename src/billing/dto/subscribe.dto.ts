import { IsEnum } from 'class-validator';
import { Plan } from '../../common/enums/plan.enum';

export class SubscribeDto {
  @IsEnum(Plan)
  plan: Plan;
}
