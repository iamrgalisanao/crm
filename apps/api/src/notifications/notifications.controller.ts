import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

// Any authenticated user reads their own notifications — no extra permission.
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Query('unread') unread?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list({ unreadOnly: unread === 'true', page: page ? parseInt(page, 10) : undefined, limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Get('unread-count')
  unreadCount() {
    return this.notifications.unreadCount();
  }

  @Post(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(id);
  }

  @Post('read-all')
  markAllRead() {
    return this.notifications.markAllRead();
  }
}
