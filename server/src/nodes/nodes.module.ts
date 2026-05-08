import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import {
  WorkflowNode,
  WorkflowNodeSchema,
} from './schemas/workflow-node.schema';
import { ImageGenerationService } from './services/image-generation.service';
import { SummarizationService } from './services/summarization.service';
import { TextGenerationService } from './services/text-generation.service';
import { TranscriptionService } from './services/transcription.service';
import { TranslationService } from './services/translation.service';
import { VideoGenerationService } from './services/video-generation.service';

const NODE_SERVICES = [
  TextGenerationService,
  ImageGenerationService,
  VideoGenerationService,
  TranslationService,
  TranscriptionService,
  SummarizationService,
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
