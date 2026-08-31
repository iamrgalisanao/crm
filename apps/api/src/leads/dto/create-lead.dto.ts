import {
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export const LEAD_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export class CreateLeadDto {
  @IsString() @MinLength(1)
  name!: string;

  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsUUID() sourceId?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() interest?: string;

  /** Decimal string in major units, e.g. "250000.00". Converted server-side. */
  @IsOptional() @Matches(/^\d+(\.\d{1,2})?$/, { message: 'estimatedBudget must be a decimal amount' })
  estimatedBudget?: string;

  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;

  @IsOptional() @IsIn(LEAD_PRIORITIES)
  priority?: (typeof LEAD_PRIORITIES)[number];

  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsISO8601() nextFollowupAt?: string;
}
