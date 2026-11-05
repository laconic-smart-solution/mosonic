import { coerceOpenAiImageMime } from './openai-image-mime.util';

describe('coerceOpenAiImageMime', () => {
  it('sniffs PNG magic even when the header is octet-stream', () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(
      coerceOpenAiImageMime({
        buffer,
        declaredMime: 'application/octet-stream',
        fileName: 'ref.bin',
      }),
    ).toEqual({ mimeType: 'image/png', ext: 'png' });
  });

  it('sniffs JPEG magic', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(
      coerceOpenAiImageMime({ buffer, declaredMime: 'application/octet-stream' }),
    ).toEqual({ mimeType: 'image/jpeg', ext: 'jpg' });
  });

  it('falls back to a .png filename when bytes are unknown', () => {
    expect(
      coerceOpenAiImageMime({
        buffer: Buffer.from([0x00, 0x01]),
        declaredMime: 'application/octet-stream',
        fileName: 'logo-icon.png',
      }),
    ).toEqual({ mimeType: 'image/png', ext: 'png' });
  });
});
