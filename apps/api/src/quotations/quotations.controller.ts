import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Permission } from '@crm/shared';
import { QuotationsService } from './quotations.service';
import {
  CreateQuotationDto,
  UpdateQuotationHeaderDto,
  SetItemsDto,
  RejectQuotationDto,
  ApproveQuotationDto,
} from './dto/quotation.dto';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get('approval-rules')
  @RequirePermissions(Permission.QUOTATIONS_VIEW)
  approvalRules() {
    return this.quotations.listApprovalRules();
  }

  @Get()
  @RequirePermissions(Permission.QUOTATIONS_VIEW)
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.quotations.list({ q, status, page: page ? parseInt(page, 10) : undefined, limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Get(':id')
  @RequirePermissions(Permission.QUOTATIONS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.QUOTATIONS_CREATE)
  create(@Body() dto: CreateQuotationDto) {
    return this.quotations.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.QUOTATIONS_EDIT)
  updateHeader(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuotationHeaderDto) {
    return this.quotations.updateHeader(id, dto);
  }

  @Put(':id/items')
  @RequirePermissions(Permission.QUOTATIONS_EDIT)
  setItems(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetItemsDto) {
    return this.quotations.setItems(id, dto.items);
  }

  @Delete(':id')
  @RequirePermissions(Permission.QUOTATIONS_EDIT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.remove(id);
  }

  @Post(':id/submit')
  @RequirePermissions(Permission.QUOTATIONS_SUBMIT)
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.submit(id);
  }

  @Post(':id/approve')
  @RequirePermissions(Permission.QUOTATIONS_APPROVE)
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveQuotationDto) {
    return this.quotations.approve(id, dto.comments);
  }

  @Post(':id/reject')
  @RequirePermissions(Permission.QUOTATIONS_APPROVE)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectQuotationDto) {
    return this.quotations.reject(id, dto.reason);
  }

  @Post(':id/send')
  @RequirePermissions(Permission.QUOTATIONS_EDIT)
  send(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.send(id);
  }

  @Post(':id/viewed')
  @RequirePermissions(Permission.QUOTATIONS_EDIT)
  markViewed(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.markViewed(id);
  }

  @Post(':id/accept')
  @RequirePermissions(Permission.QUOTATIONS_EDIT)
  accept(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.accept(id);
  }

  @Post(':id/decline')
  @RequirePermissions(Permission.QUOTATIONS_EDIT)
  decline(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.decline(id);
  }

  @Post(':id/cancel')
  @RequirePermissions(Permission.QUOTATIONS_EDIT)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.cancel(id);
  }
}
