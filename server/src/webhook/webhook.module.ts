import { Module } from '@nestjs/common';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { EventsModule } from '../events/events.module';
import { PostModule } from '../post/post.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UsersModule } from '../users/users.module';
import { CommsModule } from '../comms/comms.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    OrchestrationModule,
    PostModule,
    RepositoriesModule,
    EventsModule,
    UsersModule,
    CommsModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
