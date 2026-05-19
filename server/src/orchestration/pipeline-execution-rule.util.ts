import { mergeRuleWithOverlay } from '../rule/rule-overlay.util';
import type { Rule } from '../rule/schemas/rule.schema';
import type { RuleDocument } from '../rule/schemas/rule.schema';
import type { PipelineDocument } from '../pipeline/schemas/pipeline.schema';

/** Rule used for node execution (base + ephemeral overlay). */
export function resolveExecutionRule(
  pipeline: PipelineDocument,
  rule: Rule | RuleDocument,
): Rule {
  const base =
    typeof (rule as RuleDocument).toObject === 'function'
      ? ((rule as RuleDocument).toObject() as Rule)
      : (rule as Rule);
  const overlay = pipeline.ruleOverlay;
  if (!overlay?.patches?.length) {
    return base;
  }
  return mergeRuleWithOverlay(base, overlay.patches);
}
