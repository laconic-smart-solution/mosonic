import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import { NodesModule } from '../nodes/nodes.module';
import { RuleModule } from '../rule/rule.module';
import {
  WorkflowNode,
  WorkflowNodeSchema,
} from '../nodes/schemas/workflow-node.schema';
import { WorkflowController } from './workflow.controller';
import { WorkflowHeygenController } from './workflow-heygen.controller';
import { WorkflowHeygenService } from './workflow-heygen.service';
import { Pipeline, PipelineSchema } from '../pipeline/schemas/pipeline.schema';
import { Workflow, WorkflowSchema } from './schemas/workflow.schema';
import { WorkflowGenerationService } from './services/workflow-generation.service';
import { WorkflowConfigGenerationService } from './services/workflow-config-generation.service';
import { WorkflowService } from './workflow.service';
import { WorkflowResolveService } from './workflow-resolve.service';

@Module({
  imports: [
    AuthModule,
    CreditModule,
    EventsModule,
    LlmModule,
    NodesModule,
    RuleModule,
    MongooseModule.forFeature([
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowNode.name, schema: WorkflowNodeSchema },
      { name: Pipeline.name, schema: PipelineSchema },
    ]),
  ],
  controllers: [WorkflowController, WorkflowHeygenController],
  providers: [
    WorkflowService,
    WorkflowGenerationService,
    WorkflowConfigGenerationService,
    WorkflowResolveService,
    WorkflowHeygenService,
  ],
  exports: [MongooseModule, WorkflowService, WorkflowResolveService],
})
export class WorkflowModule {}
