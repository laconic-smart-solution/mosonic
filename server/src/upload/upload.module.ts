import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';
import { EventsModule } from '../events/events.module';
import { McpModule } from '../mcp/mcp.module';
import { PostModule } from '../post/post.module';
import { Post, PostSchema } from '../post/schemas/post.schema';
import { UsersModule } from '../users/users.module';
import { Upload, UploadSchema } from './schemas/upload.schema';
import { SyncLock, SyncLockSchema } from './sync-lock.schema';
import { UploadController } from './upload.controller';
import { UploadMediaController } from './upload-media.controller';
import { UploadScheduledSyncService } from './upload-scheduled-sync.service';
import { UploadService } from './upload.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    EventsModule,
    UsersModule,
    McpModule,
    forwardRef(() => ContentModule),
    PostModule,
    MongooseModule.forFeature([
      { name: Upload.name, schema: UploadSchema },
      { name: SyncLock.name, schema: SyncLockSchema },
      { name: Post.name, schema: PostSchema },
    ]),
  ],
  controllers: [UploadMediaController, UploadController],
  providers: [UploadService, UploadScheduledSyncService],
  exports: [MongooseModule, UploadService],
})
export class UploadModule {}
