import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import {
  WorkflowNode,
  WorkflowNodeSchema,
} from './schemas/workflow-node.schema';
import { ImageGenerationService } from './services/image-generation.service';
import { KeywordPlannerService } from './services/keyword-planner.service';
import { SummarizationService } from './services/summarization.service';
import { TextGenerationService } from './services/text-generation.service';
import { TranscriptionService } from './services/transcription.service';
import { TranslationService } from './services/translation.service';
import { VideoGenerationService } from './services/video-generation.service';
import { AdaptNodeService } from './services/adapt-node.service';
import { IntelligenceNodeService } from './services/intelligence-node.service';
import { MergeBarrierService } from './services/merge-barrier.service';

const NODE_SERVICES = [
  KeywordPlannerService,
  TextGenerationService,
  ImageGenerationService,
  VideoGenerationService,
  TranslationService,
  TranscriptionService,
  SummarizationService,
  AdaptNodeService,
  IntelligenceNodeService,
  MergeBarrierService,
];

@Module({
  imports: [
    LlmModule,
    EventsModule,
    MongooseModule.forFeature([
      { name: WorkflowNode.name, schema: WorkflowNodeSchema },
    ]),
  ],
  providers: NODE_SERVICES,
  exports: [MongooseModule, ...NODE_SERVICES],
})
export class NodesModule {}
