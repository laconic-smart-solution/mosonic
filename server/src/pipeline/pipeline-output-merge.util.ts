import type { PreviousOutputs } from '../nodes/types/node-execution.types';

const INTEL_SEP = '\n\n---\n\n';

function mergeIntelligenceField(
  previousOutputs: PreviousOutputs,
  key: 'intelligenceBrief' | 'intelligenceHints',
  value: string,
): void {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  const prev = previousOutputs[key]?.trim();
  previousOutputs[key] = prev ? `${prev}${INTEL_SEP}${trimmed}` : trimmed;
}

/** Merge parsed node output into accumulated previousOutputs (stack intelligence briefs). */
export function mergeParsedIntoPreviousOutputs(
  previousOutputs: PreviousOutputs,
  parsed: Record<string, unknown>,
): void {
  if (
    typeof parsed.intelligenceBrief === 'string' &&
    parsed.intelligenceBrief.trim()
  ) {
    mergeIntelligenceField(
      previousOutputs,
      'intelligenceBrief',
      parsed.intelligenceBrief,
    );
  }
  if (
    typeof parsed.intelligenceHints === 'string' &&
    parsed.intelligenceHints.trim()
  ) {
    mergeIntelligenceField(
      previousOutputs,
      'intelligenceHints',
      parsed.intelligenceHints,
    );
  }

  const { intelligenceBrief, intelligenceHints, ...rest } = parsed;
  Object.assign(previousOutputs, rest);
}
