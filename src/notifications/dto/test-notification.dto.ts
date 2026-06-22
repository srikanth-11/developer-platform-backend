import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ChannelType } from '../enums/channel-type.enum';

/** Body for POST /organizations/:orgId/notifications/test. */
export class TestNotificationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ChannelType, { each: true })
  channels: ChannelType[];
}
