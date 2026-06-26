import { buildExtractionContext, formatIntakeForContext } from './rule-intake-prompt.util';
import type { RuleIntakeAnswers } from './rule-intake.types';

describe('rule-intake-prompt.util', () => {
  it('includes purpose instructions in intake context', () => {
    const intake: RuleIntakeAnswers = {
      mode: 'guided',
      contentPurpose: 'internal_comms',
      channels: [{ channel: 'linkedin', priority: 'high' }],
    };
    const block = formatIntakeForContext(intake);
    expect(block).toContain('internal_comms');
    expect(block).toContain('no hashtags');
    expect(block).toContain('linkedin');
  });

  it('builds extraction context with summary', () => {
    const ctx = buildExtractionContext('Brand sells widgets.', {
      mode: 'guided',
      brandName: 'Acme',
    });
    expect(ctx).toContain('SOURCE MATERIAL SUMMARY');
    expect(ctx).toContain('widgets');
    expect(ctx).toContain('Acme');
  });
});
