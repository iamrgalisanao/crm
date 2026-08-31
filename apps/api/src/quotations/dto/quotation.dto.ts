import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MONEY = /^\d+(\.\d{1,2})?$/;
const QTY = /^\d+(\.\d{1,3})?$/;

export class QuotationItemDto {
  @IsOptional() @IsUUID() productId?: string;

  @IsOptional() @IsString() description?: string;

  @IsOptional() @Matches(QTY, { message: 'quantity must be a number with up to 3 decimals' })
  quantity?: string;

  @IsOptional() @IsString() unit?: string;

  /** Required unless a productId is given (then the product price is used). */
  @IsOptional() @Matches(MONEY, { message: 'unitPrice must be a decimal amount' })
  unitPrice?: string;

  @IsOptional() @IsIn(['none', 'percent', 'amount']) discountType?: 'none' | 'percent' | 'amount';
  @IsOptional() @IsString() discountValue?: string;
  @IsOptional() @IsUUID() taxRateId?: string;
}

export class CreateQuotationDto {
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsISO8601() issueDate?: string;
  @IsOptional() @IsISO8601() expiryDate?: string;
  @IsOptional() @IsInt() @Min(0) validityDays?: number;
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() deliveryTerms?: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items!: QuotationItemDto[];
}

export class UpdateQuotationHeaderDto {
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsISO8601() issueDate?: string;
  @IsOptional() @IsISO8601() expiryDate?: string;
  @IsOptional() @IsInt() @Min(0) validityDays?: number;
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() deliveryTerms?: string;
  @IsOptional() @IsString() notes?: string;
}

export class SetItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items!: QuotationItemDto[];
}

export class RejectQuotationDto {
  @IsString() @MinLength(1)
  reason!: string;
}

export class ApproveQuotationDto {
  @IsOptional() @IsString() comments?: string;
}
