import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';
import { PipelineEventsBridgeService } from './pipeline-events-bridge.service';
@Module({
  imports: [ConfigModule, AuthModule],
  providers: [EventsGateway, EventsService, PipelineEventsBridgeService],
  exports: [EventsService],
})
export class EventsModule {}
