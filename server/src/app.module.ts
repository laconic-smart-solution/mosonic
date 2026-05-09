import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PreprocessingModule } from './preprocessing/preprocessing.module';
import { ContentModule } from './content/content.module';
import { EventsModule } from './events/events.module';
import { LlmModule } from './llm/llm.module';
import { LoggingModule } from './logging/logging.module';
import { McpModule } from './mcp/mcp.module';
import { NodesModule } from './nodes/nodes.module';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { RuleModule } from './rule/rule.module';
import { UploadModule } from './upload/upload.module';
import { WorkflowModule } from './workflow/workflow.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AdminModule,
    LlmModule,
    PreprocessingModule,
    EventsModule,
    NodesModule,
    LoggingModule,
    OrchestrationModule,
    RuleModule,
    WorkflowModule,
    PipelineModule,
    ContentModule,
    UploadModule,
    AnalyticsModule,
    McpModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI');
        if (!uri) {
          throw new Error('MONGODB_URI is not set');
        }
        return { uri };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
