import { Injectable } from '@nestjs/common';
import { AnalyticsRepository } from '../analytics/analytics.repository';
import {
  patchesFromAppliedSuggestions,
  type AppliedSuggestionPatch,
} from '../rule/rule-overlay.util';
import type { RuleDocument } from '../rule/schemas/rule.schema';
import type { PipelineRuleOverlay } from '../pipeline/schemas/pipeline.schema';

@Injectable()
export class RuleOverlayBuilderService {
  constructor(private readonly analyticsRepo: AnalyticsRepository) {}

  async buildForPipeline(
    rule: RuleDocument,
    options: { useLearnings: boolean },
  ): Promise<PipelineRuleOverlay | null> {
    if (!options.useLearnings) {
      return null;
    }

    const analytics = await this.analyticsRepo.findByRuleRef(rule.ruleId);
    if (!analytics?.feedbackSignal?.suggestions?.length) {
      return null;
    }

    const applied = analytics.feedbackSignal.suggestions.filter(
      (s) => s.status === 'applied',
    );
    if (applied.length === 0) {
      return null;
    }

    const patches: AppliedSuggestionPatch[] = patchesFromAppliedSuggestions(
      applied,
    );
    if (patches.length === 0) {
      return null;
    }

    return {
      baseRuleVersion: rule.versions?.length ?? 0,
      appliedSuggestionIds: applied.map((_, i) => String(i)),
      patches,
      analyticsSnapshotAt: analytics.pulledAt ?? new Date(),
    };
  }
}
