import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { WorkflowNode, WorkflowNodeSchema } from '../nodes/schemas/workflow-node.schema';
import { Pipeline, PipelineSchema } from '../pipeline/schemas/pipeline.schema';
import { Rule, RuleSchema } from '../rule/schemas/rule.schema';
import { UploadModule } from '../upload/upload.module';
import { ContentController } from './content.controller';
import { ContentRepository } from './content.repository';
import { FileProxyController } from './file-proxy.controller';
import { FileProxyService } from './file-proxy.service';
import { ContentService } from './content.service';
import { Content, ContentSchema } from './schemas/content.schema';

@Module({
  imports: [
    ConfigModule,
    OrchestrationModule,
    UploadModule,
    MongooseModule.forFeature([
      { name: Content.name, schema: ContentSchema },
      { name: Pipeline.name, schema: PipelineSchema },
      { name: WorkflowNode.name, schema: WorkflowNodeSchema },
      { name: Rule.name, schema: RuleSchema },
    ]),
  ],
  controllers: [ContentController, FileProxyController],
  providers: [ContentService, ContentRepository, FileProxyService],
  exports: [MongooseModule, ContentService],
})
export class ContentModule {}
