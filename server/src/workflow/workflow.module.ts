import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import { NodesModule } from '../nodes/nodes.module';
import { RuleModule } from '../rule/rule.module';
import {
  WorkflowNode,
  WorkflowNodeSchema,
} from '../nodes/schemas/workflow-node.schema';
import { WorkflowController } from './workflow.controller';
import { Workflow, WorkflowSchema } from './schemas/workflow.schema';
import { WorkflowGenerationService } from './services/workflow-generation.service';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [
    AuthModule,
    EventsModule,
    LlmModule,
    NodesModule,
    RuleModule,
    MongooseModule.forFeature([
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowNode.name, schema: WorkflowNodeSchema },
    ]),
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowGenerationService],
  exports: [MongooseModule, WorkflowService],
})
export class WorkflowModule {}
