import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export const ACCOUNT_STATUSES = ['prospect', 'active', 'inactive', 'churned'] as const;

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() taxId?: string;

  @IsOptional() @IsIn(ACCOUNT_STATUSES)
  status?: (typeof ACCOUNT_STATUSES)[number];

  @IsOptional() @IsUUID()
  ownerId?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsString() notes?: string;
}
