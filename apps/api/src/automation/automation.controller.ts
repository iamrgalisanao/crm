import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { Permission } from '@crm/shared';
import { AutomationService } from './automation.service';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

class CreateRuleDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() trigger!: string;
  @IsOptional() @IsArray() conditions?: any[];
  @IsArray() actions!: { type: string; config: Record<string, any> }[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class SetActiveDto {
  @IsBoolean() isActive!: boolean;
}

@Controller('automation')
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get('triggers')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  triggers() { return this.automation.triggers(); }

  @Get('rules')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  list() { return this.automation.list(); }

  @Post('rules')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  create(@Body() dto: CreateRuleDto) { return this.automation.create(dto); }

  @Post('rules/:id/active')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetActiveDto) { return this.automation.setActive(id, dto.isActive); }

  @Delete('rules/:id')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.automation.remove(id); }

  @Get('runs')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  runs(@Query('ruleId') ruleId?: string) { return this.automation.runs(ruleId); }
}
