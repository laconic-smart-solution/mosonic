import { extractAiMessageText } from './ai-message-text.util';

describe('extractAiMessageText', () => {
  it('returns a plain string', () => {
    expect(extractAiMessageText('Started Instagram.')).toBe('Started Instagram.');
  });

  it('pulls text out of Responses API content parts', () => {
    expect(
      extractAiMessageText([
        {
          type: 'text',
          text: 'I started adapting the current post for Instagram. You can follow the update below.',
          annotations: [],
          phase: 'final_answer',
        },
      ]),
    ).toBe(
      'I started adapting the current post for Instagram. You can follow the update below.',
    );
  });

  it('unwraps a JSON.stringified Responses part (the leak we shipped)', () => {
    const leaked = JSON.stringify({
      type: 'text',
      text: 'I started adapting the current post for Instagram. You can follow the update below.',
      annotations: [],
      phase: 'final_answer',
    });
    expect(extractAiMessageText(leaked)).toBe(
      'I started adapting the current post for Instagram. You can follow the update below.',
    );
  });

  it('leaves ordinary JSON the user might type alone', () => {
    expect(extractAiMessageText('{"lane":"instagram"}')).toBe(
      '{"lane":"instagram"}',
    );
  });
});
