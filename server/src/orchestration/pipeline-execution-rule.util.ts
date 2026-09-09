import type { PipelineRecord } from '../domain/pipeline/pipeline.types';
import type { PipelineRuleOverlay } from '../pipeline/schemas/pipeline.schema';
import { mergeRuleWithOverlay } from '../rule/rule-overlay.util';
import type { RuleRecord } from '../repositories/interfaces/rule.repository.interface';
import type { Rule } from '../rule/schemas/rule.schema';

/** Rule used for node execution (base + ephemeral overlay). */
export function resolveExecutionRule(
  pipeline: PipelineRecord,
  rule: Rule | RuleRecord,
): Rule {
  const base = rule as unknown as Rule;
  const overlay = pipeline.ruleOverlay as
    | PipelineRuleOverlay
    | null
    | undefined;
  if (!overlay?.patches?.length) {
    return base;
  }
  return mergeRuleWithOverlay(base, overlay.patches);
}
