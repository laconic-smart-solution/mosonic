import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';
import { EventsModule } from '../events/events.module';
import { McpModule } from '../mcp/mcp.module';
import { PostModule } from '../post/post.module';
import { RedNoteModule } from '../rednote/rednote.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { UsersModule } from '../users/users.module';
import { CommsModule } from '../comms/comms.module';
import { UploadController } from './upload.controller';
import { UploadMediaController } from './upload-media.controller';
import { UploadMediaService } from './upload-media.service';
import { UploadScheduledSyncService } from './upload-scheduled-sync.service';
import { UploadService } from './upload.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    EventsModule,
    UsersModule,
    McpModule,
    forwardRef(() => RedNoteModule),
    RepositoriesModule,
    forwardRef(() => ContentModule),
    forwardRef(() => PostModule),
    forwardRef(() => SchedulerModule),
    CommsModule,
  ],
  controllers: [UploadMediaController, UploadController],
  providers: [UploadService, UploadMediaService, UploadScheduledSyncService],
  exports: [UploadService, UploadMediaService],
})
export class UploadModule {}
