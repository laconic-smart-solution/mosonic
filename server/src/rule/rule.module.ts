import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { RuleExtractController } from './rule-extract.controller';
import { RuleController } from './rule.controller';
import { RuleExtractionService } from './rule-extraction.service';
import { RuleService } from './rule.service';

@Module({
  imports: [
    AuthModule,
    CreditModule,
    LlmModule,
    EventsModule,
    RepositoriesModule,
  ],
  controllers: [RuleController, RuleExtractController],
  providers: [RuleService, RuleExtractionService],
  exports: [RuleService, RuleExtractionService],
})
export class RuleModule {}
