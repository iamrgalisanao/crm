import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';
import { ProductType } from '@crm/shared';

const TYPES = Object.values(ProductType) as string[];
const MONEY = /^\d+(\.\d{1,2})?$/;

export class CreateProductDto {
  @IsString() @MinLength(1)
  sku!: string;

  @IsString() @MinLength(1)
  name!: string;

  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(TYPES) type?: string;
  @IsOptional() @IsString() unit?: string;

  @IsOptional() @Matches(MONEY, { message: 'defaultPrice must be a decimal amount' })
  defaultPrice?: string;

  @IsOptional() @Matches(MONEY, { message: 'cost must be a decimal amount' })
  cost?: string;

  @IsOptional() @IsUUID() taxRateId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(1) sku?: string;
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(TYPES) type?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @Matches(MONEY) defaultPrice?: string;
  @IsOptional() @Matches(MONEY) cost?: string;
  @IsOptional() @IsUUID() taxRateId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCategoryDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsUUID() parentId?: string;
}
