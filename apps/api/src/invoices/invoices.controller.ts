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
import { InvoicesService } from './invoices.service';
import { UpdateInvoiceDto } from './dto/invoice.dto';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermissions(Permission.INVOICES_VIEW)
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('overdue') overdue?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.invoices.list({ q, status, overdue: overdue === 'true', page: page ? parseInt(page, 10) : undefined, limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Get('summary')
  @RequirePermissions(Permission.INVOICES_VIEW)
  summary() {
    return this.invoices.summary();
  }

  @Post('from-order/:orderId')
  @RequirePermissions(Permission.INVOICES_MANAGE)
  fromOrder(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.invoices.createFromOrder(orderId);
  }

  @Get(':id')
  @RequirePermissions(Permission.INVOICES_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.INVOICES_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoices.update(id, dto);
  }

  @Post(':id/send')
  @RequirePermissions(Permission.INVOICES_MANAGE)
  send(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.send(id);
  }

  @Post(':id/void')
  @RequirePermissions(Permission.INVOICES_MANAGE)
  voidInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.voidInvoice(id);
  }
}
