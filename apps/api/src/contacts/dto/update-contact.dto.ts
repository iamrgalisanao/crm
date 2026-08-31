import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class UpdateContactDto {
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsString() @MinLength(1) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) lastName?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsBoolean() isDecisionMaker?: boolean;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() commPreference?: string;
  @IsOptional() @IsString() notes?: string;
}
