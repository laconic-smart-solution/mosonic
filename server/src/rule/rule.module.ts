import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import { RuleExtractController } from './rule-extract.controller';
import { RuleController } from './rule.controller';
import { RuleExtractionService } from './rule-extraction.service';
import { RuleService } from './rule.service';
import { Rule, RuleSchema } from './schemas/rule.schema';

@Module({
  imports: [
    LlmModule,
    EventsModule,
    MongooseModule.forFeature([{ name: Rule.name, schema: RuleSchema }]),
  ],
  controllers: [RuleController, RuleExtractController],
  providers: [RuleService, RuleExtractionService],
  exports: [MongooseModule, RuleService, RuleExtractionService],
})
export class RuleModule {}
