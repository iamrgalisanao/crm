import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ActivityType } from '@crm/shared';
import { ACTIVITY_PRIORITIES } from './create-activity.dto';

const TYPES = Object.values(ActivityType) as string[];

export class UpdateActivityDto {
  @IsOptional() @IsIn(TYPES) type?: string;
  @IsOptional() @IsString() @MinLength(1) subject?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsISO8601() dueDate?: string;
  @IsOptional() @IsString() dueTime?: string;
  @IsOptional() @IsIn(ACTIVITY_PRIORITIES) priority?: (typeof ACTIVITY_PRIORITIES)[number];
  @IsOptional() @IsISO8601() reminderAt?: string;
}

export class CompleteActivityDto {
  @IsOptional() @IsString() outcome?: string;
}
