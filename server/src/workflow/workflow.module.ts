import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { DatabaseModule } from '../database/database.module';
import { EventsModule } from '../events/events.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { LlmModule } from '../llm/llm.module';
import { NodesModule } from '../nodes/nodes.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { RuleModule } from '../rule/rule.module';
import { WorkflowController } from './workflow.controller';
import { WorkflowHeygenController } from './workflow-heygen.controller';
import { WorkflowHeygenService } from './workflow-heygen.service';
import { WorkflowGenerationService } from './services/workflow-generation.service';
import { WorkflowConfigGenerationService } from './services/workflow-config-generation.service';
import { WorkflowService } from './workflow.service';
import { WorkflowResolveService } from './workflow-resolve.service';

@Module({
  imports: [
    AuthModule,
    CreditModule,
    DatabaseModule,
    EventsModule,
    IntegrationsModule,
    LlmModule,
    NodesModule,
    RepositoriesModule,
    RuleModule,
  ],
  controllers: [WorkflowController, WorkflowHeygenController],
  providers: [
    WorkflowService,
    WorkflowGenerationService,
    WorkflowConfigGenerationService,
    WorkflowResolveService,
    WorkflowHeygenService,
  ],
  exports: [WorkflowService, WorkflowResolveService],
})
export class WorkflowModule {}
