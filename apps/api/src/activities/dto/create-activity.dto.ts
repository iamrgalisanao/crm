import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ActivityType, ActivityRelatedType } from '@crm/shared';

const TYPES = Object.values(ActivityType) as string[];
export const ALLOWED_RELATED_TYPES = [
  ActivityRelatedType.LEAD,
  ActivityRelatedType.ACCOUNT,
  ActivityRelatedType.CONTACT,
  ActivityRelatedType.OPPORTUNITY,
] as string[];
export const ACTIVITY_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export class CreateActivityDto {
  @IsIn(TYPES)
  type!: string;

  @IsString() @MinLength(1)
  subject!: string;

  @IsOptional() @IsString() description?: string;

  @IsIn(ALLOWED_RELATED_TYPES)
  relatedType!: string;

  @IsUUID()
  relatedId!: string;

  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsISO8601() dueDate?: string;
  @IsOptional() @IsString() dueTime?: string;
  @IsOptional() @IsIn(ACTIVITY_PRIORITIES) priority?: (typeof ACTIVITY_PRIORITIES)[number];
  @IsOptional() @IsISO8601() reminderAt?: string;
}
