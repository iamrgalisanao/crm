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
import { OPP_PRIORITIES } from './create-opportunity.dto';

export class UpdateOpportunityDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() primaryContactId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @Matches(/^\d+(\.\d{1,2})?$/) amount?: string;
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

export class ChangeStageDto {
  @IsUUID()
  stageId!: string;
}

export class WinOpportunityDto {
  @IsOptional() @Matches(/^\d+(\.\d{1,2})?$/) amount?: string;
  @IsOptional() @IsISO8601() closeDate?: string;
}

export class LoseOpportunityDto {
  @IsString() @MinLength(1)
  lostReason!: string;

  @IsOptional() @IsString() lostNotes?: string;
}
