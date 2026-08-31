import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '@crm/shared';
import { OrdersService } from './orders.service';
import { ChangeOrderStatusDto, SetDeliveryStatusDto, UpdateOrderDto } from './dto/order.dto';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('sales-orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions(Permission.SALES_ORDERS_VIEW)
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orders.list({ q, status, page: page ? parseInt(page, 10) : undefined, limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Post('from-quotation/:quotationId')
  @RequirePermissions(Permission.SALES_ORDERS_MANAGE)
  fromQuotation(@Param('quotationId', ParseUUIDPipe) quotationId: string) {
    return this.orders.createFromQuotation(quotationId);
  }

  @Get(':id')
  @RequirePermissions(Permission.SALES_ORDERS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SALES_ORDERS_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderDto) {
    return this.orders.update(id, dto);
  }

  @Post(':id/status')
  @RequirePermissions(Permission.SALES_ORDERS_MANAGE)
  changeStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeOrderStatusDto) {
    return this.orders.changeStatus(id, dto);
  }

  @Post(':id/delivery')
  @RequirePermissions(Permission.SALES_ORDERS_MANAGE)
  setDelivery(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetDeliveryStatusDto) {
    return this.orders.setDeliveryStatus(id, dto);
  }
}
