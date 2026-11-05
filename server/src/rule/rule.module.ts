import { forwardRef, Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { ImageFileService } from '../content/image-file.service';
import { EventsModule } from '../events/events.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { LlmModule } from '../llm/llm.module';
import { McpModule } from '../mcp/mcp.module';
import { PlanModule } from '../plan/plan.module';
import { PostModule } from '../post/post.module';
import { RedNoteModule } from '../rednote/rednote.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UploadModule } from '../upload/upload.module';
import { RuleAssetController } from './rule-asset.controller';
import { RuleAssetService } from './rule-asset.service';
import { RuleAssetSearchService } from './rule-asset-search.service';
import { RuleMemoryController } from './rule-memory.controller';
import { RuleMemoryService } from './rule-memory.service';
import { RuleMemorySearchService } from './rule-memory-search.service';
import { RuleExtractController } from './rule-extract.controller';
import { RuleController } from './rule.controller';
import { RuleExtractionService } from './rule-extraction.service';
import { RuleService } from './rule.service';
import { RuleToolsController } from './rule-tools.controller';
import { RuleToolsService } from './rule-tools.service';
import { ChatSessionController } from './chat/chat-session.controller';
import { ChatSessionService } from './chat/chat-session.service';
import { ChatTurnLockService } from './chat/chat-turn-lock.service';
import { ChatPipelineFollowupService } from './chat/chat-pipeline-followup.service';

@Module({
  imports: [
    AuthModule,
    CreditModule,
    IntegrationsModule,
    LlmModule,
    EventsModule,
    RepositoriesModule,
    McpModule,
    PlanModule,
    forwardRef(() => UploadModule),
    forwardRef(() => PostModule),
    forwardRef(() => RedNoteModule),
    forwardRef(() => WorkflowModule),
    forwardRef(() => OrchestrationModule),
    forwardRef(() => ContentModule),
  ],
  controllers: [
    RuleController,
    RuleExtractController,
    RuleAssetController,
    RuleMemoryController,
    RuleToolsController,
    ChatSessionController,
  ],
  providers: [
    RuleService,
    RuleExtractionService,
    ImageFileService,
    RuleAssetService,
    RuleAssetSearchService,
    RuleMemoryService,
    RuleMemorySearchService,
    RuleToolsService,
    ChatSessionService,
    ChatTurnLockService,
    ChatPipelineFollowupService,
  ],
  exports: [RuleService, RuleExtractionService, RuleAssetSearchService],
})
export class RuleModule {}
