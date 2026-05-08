import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Content, ContentSchema } from '../content/schemas/content.schema';
import { EventsModule } from '../events/events.module';
import { LoggingModule } from '../logging/logging.module';
import { NodesModule } from '../nodes/nodes.module';
import { WorkflowNode, WorkflowNodeSchema } from '../nodes/schemas/workflow-node.schema';
import { Pipeline, PipelineSchema } from '../pipeline/schemas/pipeline.schema';
import { Rule, RuleSchema } from '../rule/schemas/rule.schema';
import { Workflow, WorkflowSchema } from '../workflow/schemas/workflow.schema';
import { NodeExecutor } from './node-executor.service';
import { OrchestrationService } from './orchestration.service';

@Module({
  imports: [
    NodesModule,
    LoggingModule,
    EventsModule,
    MongooseModule.forFeature([
      { name: Pipeline.name, schema: PipelineSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowNode.name, schema: WorkflowNodeSchema },
      { name: Rule.name, schema: RuleSchema },
      { name: Content.name, schema: ContentSchema },
    ]),
  ],
  providers: [NodeExecutor, OrchestrationService],
  exports: [NodeExecutor, OrchestrationService],
})
export class OrchestrationModule {}
