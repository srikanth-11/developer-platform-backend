import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { OrganizationType } from '../../common/enums/organization-type.enum';

/** Body for POST /organizations. The creator automatically becomes OWNER. */
export class CreateOrganizationDto {
  @IsString()
  @MinLength(2, { message: 'Organization name must be at least 2 characters' })
  @MaxLength(100)
  name: string;

  // Publisher (lists APIs) or Subscriber (consumes APIs). Fixed at creation.
  @IsEnum(OrganizationType, {
    message: `type must be one of: ${Object.values(OrganizationType).join(', ')}`,
  })
  type: OrganizationType;
}
