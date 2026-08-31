import {
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export const OPP_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export class CreateOpportunityDto {
  @IsString() @MinLength(1)
  name!: string;

  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() primaryContactId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsUUID() pipelineId?: string;
  @IsOptional() @IsUUID() stageId?: string;

  /** Decimal string in major units, e.g. "250000.00". */
  @IsOptional() @Matches(/^\d+(\.\d{1,2})?$/, { message: 'amount must be a decimal amount' })
  amount?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsISO8601() expectedCloseDate?: string;
  @IsOptional() @IsUUID() sourceId?: string;
  @IsOptional() @IsIn(OPP_PRIORITIES) priority?: (typeof OPP_PRIORITIES)[number];
  @IsOptional() @IsString() competitor?: string;
  @IsOptional() @IsString() nextAction?: string;
  @IsOptional() @IsISO8601() nextActionAt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
}
