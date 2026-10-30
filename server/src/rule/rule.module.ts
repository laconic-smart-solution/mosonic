import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { ImageFileService } from '../content/image-file.service';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { RuleAssetController } from './rule-asset.controller';
import { RuleAssetService } from './rule-asset.service';
import { RuleAssetSearchService } from './rule-asset-search.service';
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
  controllers: [RuleController, RuleExtractController, RuleAssetController],
  providers: [
    RuleService,
    RuleExtractionService,
    ImageFileService,
    RuleAssetService,
    RuleAssetSearchService,
  ],
  exports: [RuleService, RuleExtractionService, RuleAssetSearchService],
})
export class RuleModule {}
