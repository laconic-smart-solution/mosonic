import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../llm/llm.service';
import { calcWordBudget } from './presenter-script.util';
import { ScriptDurationService } from './script-duration.service';

describe('ScriptDurationService', () => {
  let service: ScriptDurationService;
  const invoke = jest.fn();

  beforeEach(async () => {
    invoke.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScriptDurationService,
        {
          provide: LlmService,
          useValue: {
            getChatModelForPlainText: jest.fn().mockReturnValue({ invoke }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'SCRIPT_REWRITE_OPENAI_MODEL'
                ? 'gpt-4o-mini'
                : undefined,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ScriptDurationService);
  });

  it('expands short scripts under 85% of word budget', async () => {
    const script = 'Short caption for the product launch today.';
    invoke.mockResolvedValue({
      content:
        'Hey there! We are excited to share our latest product launch with you today and hope you love what we built.',
    });

    const result = await service.fitScriptToDuration(script, 10);
    expect(result.method).toBe('expanded');
    expect(result.wordCount).toBeGreaterThan(countWords(script));
    expect(invoke).toHaveBeenCalled();
  });

  it('returns unchanged when within expand and rewrite thresholds', async () => {
    const budget = calcWordBudget(10);
    const script = Array.from(
      { length: Math.ceil(budget * 0.9) },
      (_, i) => `word${i}`,
    ).join(' ');

    const result = await service.fitScriptToDuration(script, 10);
    expect(result.method).toBe('unchanged');
    expect(result.script).toBe(script);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rewrites when script is far over budget', async () => {
    const longScript = Array.from({ length: 400 }, (_, i) => `word${i}`).join(
      ' ',
    );
    invoke.mockResolvedValue({
      content: 'Condensed marketing script with a clear call to action.',
    });

    const result = await service.fitScriptToDuration(longScript, 10);
    expect(result.method).toBe('rewritten');
    expect(result.script).toContain('Condensed');
    expect(invoke).toHaveBeenCalled();
  });

  it('falls back to trim when GPT rewrite fails', async () => {
    const longScript = Array.from({ length: 400 }, (_, i) => `word${i}`).join(
      ' ',
    );
    invoke.mockRejectedValue(new Error('API error'));

    const result = await service.fitScriptToDuration(longScript, 10);
    expect(result.method).toBe('trimmed');
    expect(result.script.endsWith('…')).toBe(true);
    expect(result.wordCount).toBeLessThanOrEqual(calcWordBudget(10));
  });

  it('hard-trims when GPT returns too many words', async () => {
    const longScript = Array.from({ length: 400 }, (_, i) => `word${i}`).join(
      ' ',
    );
    const stillLong = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ');
    invoke.mockResolvedValue({ content: stillLong });

    const result = await service.fitScriptToDuration(longScript, 10);
    expect(result.method).toBe('rewritten');
    expect(result.wordCount).toBeLessThanOrEqual(calcWordBudget(10));
  });

  it('keeps original script when expand fails', async () => {
    const script = 'Brief launch note.';
    invoke.mockRejectedValue(new Error('API error'));

    const result = await service.fitScriptToDuration(script, 10);
    expect(result.method).toBe('unchanged');
    expect(result.script).toBe(script);
  });
});

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
