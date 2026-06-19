import type { Rule } from './schemas/rule.schema';
import type { RuleDocument } from './schemas/rule.schema';
import { buildSuggestionUpdateDto } from './rule-suggestion-field-patch.util';
import type { UpdateRuleDto } from './dto/update-rule.dto';

export type AppliedSuggestionPatch = {
  field: string;
  suggestedValue: unknown;
};

/** Deep-merge partial UpdateRuleDto fields into a plain rule object (execution-only). */
function applyUpdateDtoToRule(base: Rule, dto: UpdateRuleDto): Rule {
  const next = structuredClone(base) as Rule;
  if (dto.brand) {
    next.brand = { ...next.brand, ...dto.brand };
  }
  if (dto.campaign) {
    next.campaign = { ...next.campaign, ...dto.campaign } as Rule['campaign'];
  }
  if (dto.channels) {
    next.channels = dto.channels;
  }
  return next;
}

/**
 * Merge ephemeral overlay patches onto the saved rule for pipeline execution.
 * Does not persist — overlay lives on the pipeline document only.
 */
export function mergeRuleWithOverlay(
  base: Rule | RuleDocument,
  patches: AppliedSuggestionPatch[],
): Rule {
  const plain = structuredClone(base as Rule);
  let merged = plain;
  for (const patch of patches) {
    const dto = buildSuggestionUpdateDto(
      merged,
      patch.field,
      patch.suggestedValue,
    );
    merged = applyUpdateDtoToRule(merged, dto);
  }
  return merged;
}

export function patchesFromAppliedSuggestions(
  suggestions: Array<{
    field: string;
    suggestedValue: unknown;
    status: string;
  }>,
): AppliedSuggestionPatch[] {
  return suggestions
    .filter((s) => s.status === 'applied')
    .map((s) => ({ field: s.field, suggestedValue: s.suggestedValue }));
}
