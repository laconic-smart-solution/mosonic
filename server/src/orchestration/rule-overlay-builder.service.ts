import { Injectable } from '@nestjs/common';
import type { RuleRecord } from '../repositories/interfaces/rule.repository.interface';
import type { PipelineRuleOverlay } from '../pipeline/schemas/pipeline.schema';

@Injectable()
export class RuleOverlayBuilderService {
  buildForPipeline(
    _rule: RuleRecord,
    _options: { useLearnings: boolean },
  ): Promise<PipelineRuleOverlay | null> {
    return Promise.resolve(null);
  }
}
