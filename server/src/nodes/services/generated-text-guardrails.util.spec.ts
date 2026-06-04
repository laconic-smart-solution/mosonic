import { sanitizeGeneratedPostText } from './generated-text-guardrails.util';

describe('sanitizeGeneratedPostText', () => {
  it('removes [Visual: ...] blocks and trims', () => {
    const input =
      '[Visual: Clean, modern graphic showcasing a developer]\n\nHello world!  ';
    expect(sanitizeGeneratedPostText(input)).toBe('Hello world!');
  });

  it('removes translated text overlays section', () => {
    const input = [
      'Meet Zernio: developer-friendly social media API.',
      '',
      'Translated text overlays highlighting key features:',
      '"Integración rápida y sencilla,"',
      '"Publicación y programación,"',
      '',
      'Final line.',
    ].join('\n');
    expect(sanitizeGeneratedPostText(input)).toBe(
      ['Meet Zernio: developer-friendly social media API.', '', 'Final line.'].join(
        '\n',
      ),
    );
  });
});

