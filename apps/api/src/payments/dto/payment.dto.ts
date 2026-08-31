import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { PaymentMethod } from '@crm/shared';

const METHODS = Object.values(PaymentMethod) as string[];

export class CreatePaymentDto {
  @IsUUID()
  invoiceId!: string;

  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'amount must be a decimal amount' })
  amount!: string;

  @IsIn(METHODS)
  method!: string;

  @IsOptional() @IsISO8601() paymentDate?: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() bank?: string;
  @IsOptional() @IsString() notes?: string;
}
