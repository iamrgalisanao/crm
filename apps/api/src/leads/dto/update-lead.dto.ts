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
import { LEAD_PRIORITIES } from './create-lead.dto';

export class UpdateLeadDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsUUID() sourceId?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() interest?: string;
  @IsOptional() @Matches(/^\d+(\.\d{1,2})?$/) estimatedBudget?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsIn(LEAD_PRIORITIES) priority?: (typeof LEAD_PRIORITIES)[number];
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsISO8601() nextFollowupAt?: string;
  @IsOptional() @IsISO8601() lastContactedAt?: string;
}
