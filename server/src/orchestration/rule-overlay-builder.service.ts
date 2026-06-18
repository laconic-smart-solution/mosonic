import { Injectable } from '@nestjs/common';
import type { RuleDocument } from '../rule/schemas/rule.schema';
import type { PipelineRuleOverlay } from '../pipeline/schemas/pipeline.schema';

@Injectable()
export class RuleOverlayBuilderService {
  buildForPipeline(
    _rule: RuleDocument,
    _options: { useLearnings: boolean },
  ): Promise<PipelineRuleOverlay | null> {
    return Promise.resolve(null);
  }
}
