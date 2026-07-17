import { Module, forwardRef } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { McpModule } from '../mcp/mcp.module';
import { PostModule } from '../post/post.module';
import { CommsModule } from '../comms/comms.module';
import { SchedulerClientService } from './scheduler-client.service';
import { SchedulerEventsBridgeService } from './scheduler-events-bridge.service';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    forwardRef(() => PostModule),
    McpModule,
    EventsModule,
    CommsModule,
  ],
  providers: [
    SchedulerClientService,
    SchedulerService,
    SchedulerEventsBridgeService,
  ],
  exports: [SchedulerService],
})
export class SchedulerModule {}
