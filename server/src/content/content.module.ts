import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { EventsModule } from '../events/events.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import {
  WorkflowNode,
  WorkflowNodeSchema,
} from '../nodes/schemas/workflow-node.schema';
import { Pipeline, PipelineSchema } from '../pipeline/schemas/pipeline.schema';
import { Rule, RuleSchema } from '../rule/schemas/rule.schema';
import { UserPlan, UserPlanSchema } from '../plan/schemas/user-plan.schema';
import { UploadModule } from '../upload/upload.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ContentController } from './content.controller';
import { ContentRepository } from './content.repository';
import { FileProxyController } from './file-proxy.controller';
import { FileProxyService } from './file-proxy.service';
import { ImageFileController } from './image-file.controller';
import { ImageFileService } from './image-file.service';
import { ContentService } from './content.service';
import { Content, ContentSchema } from './schemas/content.schema';

@Module({
  imports: [
    AuthModule,
    CreditModule,
    EventsModule,
    ConfigModule,
    forwardRef(() => OrchestrationModule),
    forwardRef(() => UploadModule),
    WorkflowModule,
    MongooseModule.forFeature([
      { name: Content.name, schema: ContentSchema },
      { name: Pipeline.name, schema: PipelineSchema },
      { name: WorkflowNode.name, schema: WorkflowNodeSchema },
      { name: Rule.name, schema: RuleSchema },
      { name: UserPlan.name, schema: UserPlanSchema },
    ]),
  ],
  controllers: [
    ContentController,
    FileProxyController,
    ImageFileController,
  ],
  providers: [
    ContentService,
    ContentRepository,
    FileProxyService,
    ImageFileService,
  ],
  exports: [MongooseModule, ContentService],
})
export class ContentModule {}
