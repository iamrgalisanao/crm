import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { Permission } from '@crm/shared';
import { AiService } from './ai.service';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

class DraftDto {
  @IsString() @MinLength(1) kind!: string;
  @IsOptional() @IsObject() context?: Record<string, unknown>;
}

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  status() { return { provider: this.ai.providerName }; }

  @Post('score-lead/:leadId')
  @RequirePermissions(Permission.LEADS_VIEW)
  scoreLead(@Param('leadId', ParseUUIDPipe) leadId: string) { return this.ai.scoreLead(leadId); }

  @Get('opportunity-risk/:oppId')
  @RequirePermissions(Permission.OPPORTUNITIES_VIEW)
  risk(@Param('oppId', ParseUUIDPipe) oppId: string) { return this.ai.opportunityRisk(oppId); }

  @Get('followups')
  @RequirePermissions(Permission.OPPORTUNITIES_VIEW)
  followUps() { return this.ai.followUps(); }

  @Get('briefing')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  briefing() { return this.ai.briefing(); }

  @Post('draft')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  draft(@Body() dto: DraftDto) { return this.ai.draft(dto.kind, dto.context ?? {}); }

  @Get('insights')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  insights(@Query('subjectType') subjectType: string, @Query('subjectId') subjectId?: string) {
    return this.ai.listInsights(subjectType, subjectId);
  }
}
