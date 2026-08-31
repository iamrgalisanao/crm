import { Module } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
import { PipelinesController } from './pipelines.controller';

@Module({
  providers: [OpportunitiesService],
  controllers: [OpportunitiesController, PipelinesController],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
