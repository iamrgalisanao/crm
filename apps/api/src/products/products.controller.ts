import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '@crm/shared';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, CreateCategoryDto } from './dto/product.dto';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('products')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  list(
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('type') type?: string,
    @Query('active') active?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.products.list({
      q, categoryId, type, active,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('product-categories')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  listCategories() {
    return this.products.listCategories();
  }

  @Post('product-categories')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.products.createCategory(dto);
  }

  @Get('tax-rates')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  listTaxRates() {
    return this.products.listTaxRates();
  }

  @Get('products/:id')
  @RequirePermissions(Permission.PRODUCTS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findOne(id);
  }

  @Post('products')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch('products/:id')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete('products/:id')
  @RequirePermissions(Permission.PRODUCTS_MANAGE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id);
  }
}
