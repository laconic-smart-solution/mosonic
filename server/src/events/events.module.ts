import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';
import { PipelineEventsBridgeService } from './pipeline-events-bridge.service';

@Module({
  imports: [ConfigModule],
  providers: [EventsGateway, EventsService, PipelineEventsBridgeService],
  exports: [EventsService],
})
export class EventsModule {}
