import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import { McpModule } from '../mcp/mcp.module';
import { Post, PostSchema } from '../post/schemas/post.schema';
import { RuleModule } from '../rule/rule.module';
import { Rule, RuleSchema } from '../rule/schemas/rule.schema';
import { Content, ContentSchema } from '../content/schemas/content.schema';
import { ContentModule } from '../content/content.module';
import { Upload, UploadSchema } from '../upload/schemas/upload.schema';
import { UploadModule } from '../upload/upload.module';
import { UsersModule } from '../users/users.module';
import { SyncLock, SyncLockSchema } from '../upload/sync-lock.schema';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsFeedbackService } from './analytics-feedback.service';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';
import { Analytics, AnalyticsSchema } from './schemas/analytics.schema';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    EventsModule,
    LlmModule,
    McpModule,
    forwardRef(() => RuleModule),
    forwardRef(() => ContentModule),
    UploadModule,
    MongooseModule.forFeature([
      { name: Analytics.name, schema: AnalyticsSchema },
      { name: Rule.name, schema: RuleSchema },
      { name: SyncLock.name, schema: SyncLockSchema },
      { name: Post.name, schema: PostSchema },
      { name: Content.name, schema: ContentSchema },
      { name: Upload.name, schema: UploadSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsRepository,
    AnalyticsFeedbackService,
  ],
  exports: [
    MongooseModule,
    AnalyticsService,
    AnalyticsRepository,
    AnalyticsFeedbackService,
  ],
})
export class AnalyticsModule {}
