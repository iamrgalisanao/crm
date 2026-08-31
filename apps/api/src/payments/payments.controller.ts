import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '@crm/shared';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/payment.dto';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(Permission.PAYMENTS_VIEW)
  list(
    @Query('invoiceId') invoiceId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.payments.list({ invoiceId, page: page ? parseInt(page, 10) : undefined, limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Post()
  @RequirePermissions(Permission.PAYMENTS_RECORD)
  create(@Body() dto: CreatePaymentDto) {
    return this.payments.create(dto);
  }

  @Post(':id/reverse')
  @RequirePermissions(Permission.PAYMENTS_RECORD)
  reverse(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.reverse(id);
  }
}
