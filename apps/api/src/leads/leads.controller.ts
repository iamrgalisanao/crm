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
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import {
  ChangeStatusDto,
  AssignLeadDto,
  ScoreLeadDto,
  ConvertLeadDto,
} from './dto/lead-actions.dto';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @RequirePermissions(Permission.LEADS_VIEW)
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('sourceId') sourceId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leads.list({
      q,
      status,
      sourceId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('by-location')
  @RequirePermissions(Permission.LEADS_VIEW)
  byLocation() {
    return this.leads.byLocation();
  }

  @Get(':id')
  @RequirePermissions(Permission.LEADS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leads.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.LEADS_CREATE)
  create(@Body() dto: CreateLeadDto) {
    return this.leads.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.LEADS_EDIT)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.LEADS_DELETE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.leads.remove(id);
  }

  @Post(':id/status')
  @RequirePermissions(Permission.LEADS_EDIT)
  changeStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeStatusDto) {
    return this.leads.changeStatus(id, dto);
  }

  @Post(':id/assign')
  @RequirePermissions(Permission.LEADS_ASSIGN)
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignLeadDto) {
    return this.leads.assign(id, dto);
  }

  @Post(':id/score')
  @RequirePermissions(Permission.LEADS_EDIT)
  score(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ScoreLeadDto) {
    return this.leads.score(id, dto);
  }

  @Post(':id/convert')
  @RequirePermissions(Permission.LEADS_EDIT, Permission.ACCOUNTS_CREATE)
  convert(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConvertLeadDto) {
    return this.leads.convert(id, dto);
  }
}
