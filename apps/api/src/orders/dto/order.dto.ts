import { IsIn, IsOptional, IsString } from 'class-validator';
import { SalesOrderStatus } from '@crm/shared';

const STATUSES = Object.values(SalesOrderStatus) as string[];

export class ChangeOrderStatusDto {
  @IsIn(STATUSES)
  status!: string;
}

export class SetDeliveryStatusDto {
  @IsIn(['pending', 'partial', 'delivered'])
  deliveryStatus!: string;
}

export class UpdateOrderDto {
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() deliveryTerms?: string;
  @IsOptional() @IsString() notes?: string;
}
