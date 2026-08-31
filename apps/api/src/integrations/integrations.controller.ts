import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsString, MinLength } from 'class-validator';
import { Permission } from '@crm/shared';
import { IntegrationsService } from './integrations.service';
import { RequirePermissions } from '../common/rbac/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';

class CreateChannelDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() provider!: string;
}
class SetStatusDto {
  @IsIn(['active', 'disabled']) status!: 'active' | 'disabled';
}

@Controller()
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  // ---- channels (admin) ----
  @Get('integrations/channels')
  @RequirePermissions(Permission.INTEGRATIONS_MANAGE)
  listChannels() { return this.integrations.listChannels(); }

  @Post('integrations/channels')
  @RequirePermissions(Permission.INTEGRATIONS_MANAGE)
  createChannel(@Body() dto: CreateChannelDto) { return this.integrations.createChannel(dto); }

  @Post('integrations/channels/:id/status')
  @RequirePermissions(Permission.INTEGRATIONS_MANAGE)
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetStatusDto) {
    return this.integrations.setChannelStatus(id, dto.status);
  }

  @Delete('integrations/channels/:id')
  @RequirePermissions(Permission.INTEGRATIONS_MANAGE)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.integrations.deleteChannel(id); }

  // ---- inbox ----
  @Get('inbox')
  @RequirePermissions(Permission.LEADS_VIEW)
  inbox(@Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.integrations.listInbox({ status, page: page ? parseInt(page, 10) : undefined, limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Post('inbox/:id/convert')
  @RequirePermissions(Permission.LEADS_CREATE)
  convert(@Param('id', ParseUUIDPipe) id: string) { return this.integrations.convert(id); }

  @Post('inbox/:id/ignore')
  @RequirePermissions(Permission.LEADS_EDIT)
  ignore(@Param('id', ParseUUIDPipe) id: string) { return this.integrations.ignore(id); }

  // ---- public webhook ingress ----
  @Public()
  @Post('webhooks/:channelId')
  webhook(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Headers('x-webhook-secret') secret: string,
    @Body() payload: any,
  ) {
    return this.integrations.ingest(channelId, secret, payload);
  }
}
