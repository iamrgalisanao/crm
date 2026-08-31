import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { LeadStatus } from '@crm/shared';

const STATUS_VALUES = Object.values(LeadStatus) as string[];

export class ChangeStatusDto {
  @IsIn(STATUS_VALUES)
  status!: string;

  @IsOptional() @IsString() lostReason?: string;
  @IsOptional() @IsString() lostNotes?: string;
}

export class AssignLeadDto {
  @IsUUID()
  userId!: string;
}

export class ScoreLeadDto {
  @IsOptional() @IsIn(['BANT', 'MEDDIC', 'custom'])
  model?: string;

  /** Per-criterion points, e.g. { need: 25, budget: 20, ... }. */
  @IsObject()
  criteria!: Record<string, number>;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  total?: number;
}

export class ConvertLeadDto {
  /** Link to an existing account instead of creating one. */
  @IsOptional() @IsUUID() accountId?: string;

  /** Link to an existing contact instead of creating one. */
  @IsOptional() @IsUUID() contactId?: string;

  /** Override the created account name (defaults to lead company/name). */
  @IsOptional() @IsString() @MinLength(1) accountName?: string;

  /** Reserved: create an opportunity on convert (wired in the Opportunities sprint). */
  @IsOptional() @IsBoolean() createOpportunity?: boolean;
}
