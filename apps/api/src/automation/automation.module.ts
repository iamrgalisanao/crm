import { Module } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { AutomationEngine } from './automation.engine';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [AutomationService, AutomationEngine],
  controllers: [AutomationController],
})
export class AutomationModule {}
