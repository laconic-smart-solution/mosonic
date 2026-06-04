import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../llm/llm.service';
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

  it('returns unchanged when within rewrite threshold', async () => {
    const script = 'Short caption for the product launch today.';
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

  it('falls back to trim when GPT fails', async () => {
    const longScript = Array.from({ length: 400 }, (_, i) => `word${i}`).join(
      ' ',
    );
    invoke.mockRejectedValue(new Error('API error'));

    const result = await service.fitScriptToDuration(longScript, 10);
    expect(result.method).toBe('trimmed');
    expect(result.script.endsWith('…')).toBe(true);
    expect(result.wordCount).toBeLessThanOrEqual(25);
  });

  it('hard-trims when GPT returns too many words', async () => {
    const longScript = Array.from({ length: 400 }, (_, i) => `word${i}`).join(
      ' ',
    );
    const stillLong = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ');
    invoke.mockResolvedValue({ content: stillLong });

    const result = await service.fitScriptToDuration(longScript, 10);
    expect(result.method).toBe('rewritten');
    expect(result.wordCount).toBeLessThanOrEqual(25);
  });
});
