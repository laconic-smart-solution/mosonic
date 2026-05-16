import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from '../events/events.module';
import { Post, PostSchema } from '../post/schemas/post.schema';
import { Upload, UploadSchema } from '../upload/schemas/upload.schema';
import { UsersModule } from '../users/users.module';
import { WebhookEvent, WebhookEventSchema } from './webhook-event.schema';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: Upload.name, schema: UploadSchema },
      { name: Post.name, schema: PostSchema },
    ]),
    EventsModule,
    UsersModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
