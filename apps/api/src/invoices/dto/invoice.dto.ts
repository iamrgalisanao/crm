import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class UpdateInvoiceDto {
  @IsOptional() @IsISO8601() dueDate?: string;
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @IsString() notes?: string;
}
