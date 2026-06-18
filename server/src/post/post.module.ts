import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { McpModule } from '../mcp/mcp.module';
import { SyncLock, SyncLockSchema } from '../upload/sync-lock.schema';
import { Upload, UploadSchema } from '../upload/schemas/upload.schema';
import { UsersModule } from '../users/users.module';
import { PostAnalyticsService } from './post-analytics.service';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import {
  PostAnalytics,
  PostAnalyticsSchema,
} from './schemas/post-analytics.schema';
import { Post, PostSchema } from './schemas/post.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Upload.name, schema: UploadSchema },
      { name: PostAnalytics.name, schema: PostAnalyticsSchema },
      { name: SyncLock.name, schema: SyncLockSchema },
    ]),
    UsersModule,
    McpModule,
  ],
  controllers: [PostController],
  providers: [PostService, PostAnalyticsService],
  exports: [PostService, PostAnalyticsService, MongooseModule],
})
export class PostModule {}
