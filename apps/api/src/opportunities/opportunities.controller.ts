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
import { OpportunitiesService } from './opportunities.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import {
  UpdateOpportunityDto,
  ChangeStageDto,
  WinOpportunityDto,
  LoseOpportunityDto,
} from './dto/update-opportunity.dto';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opps: OpportunitiesService) {}

  @Get()
  @RequirePermissions(Permission.OPPORTUNITIES_VIEW)
  list(
    @Query('q') q?: string,
    @Query('stageId') stageId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.opps.list({
      q, stageId, status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('board')
  @RequirePermissions(Permission.OPPORTUNITIES_VIEW)
  board() {
    return this.opps.board();
  }

  @Get(':id')
  @RequirePermissions(Permission.OPPORTUNITIES_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.opps.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.OPPORTUNITIES_CREATE)
  create(@Body() dto: CreateOpportunityDto) {
    return this.opps.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.OPPORTUNITIES_EDIT)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOpportunityDto) {
    return this.opps.update(id, dto);
  }

  @Post(':id/stage')
  @RequirePermissions(Permission.OPPORTUNITIES_EDIT)
  changeStage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeStageDto) {
    return this.opps.changeStage(id, dto);
  }

  @Post(':id/win')
  @RequirePermissions(Permission.OPPORTUNITIES_EDIT)
  win(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WinOpportunityDto) {
    return this.opps.win(id, dto);
  }

  @Post(':id/lose')
  @RequirePermissions(Permission.OPPORTUNITIES_EDIT)
  lose(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LoseOpportunityDto) {
    return this.opps.lose(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.OPPORTUNITIES_EDIT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.opps.remove(id);
  }
}
