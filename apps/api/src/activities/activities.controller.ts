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
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto, CompleteActivityDto } from './dto/update-activity.dto';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  @RequirePermissions(Permission.ACTIVITIES_VIEW)
  list(
    @Query('relatedType') relatedType?: string,
    @Query('relatedId') relatedId?: string,
    @Query('filter') filter?: 'overdue' | 'upcoming' | 'open' | 'done' | 'all',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activities.list({
      relatedType,
      relatedId,
      filter,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('counts')
  @RequirePermissions(Permission.ACTIVITIES_VIEW)
  counts() {
    return this.activities.counts();
  }

  @Post()
  @RequirePermissions(Permission.ACTIVITIES_CREATE)
  create(@Body() dto: CreateActivityDto) {
    return this.activities.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.ACTIVITIES_EDIT)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActivityDto) {
    return this.activities.update(id, dto);
  }

  @Post(':id/complete')
  @RequirePermissions(Permission.ACTIVITIES_EDIT)
  complete(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteActivityDto) {
    return this.activities.complete(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.ACTIVITIES_EDIT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.activities.remove(id);
  }
}
