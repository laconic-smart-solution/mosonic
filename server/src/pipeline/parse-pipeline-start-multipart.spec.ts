import { BadRequestException } from '@nestjs/common';
import { parsePipelineStartMultipart } from './parse-pipeline-start-multipart';

describe('parsePipelineStartMultipart', () => {
  it('accepts contentPrompt alone', () => {
    const parsed = parsePipelineStartMultipart(
      undefined,
      '  Launch sale  ',
      undefined,
    );
    expect(parsed.contentPrompt).toBe('Launch sale');
    expect(parsed.files).toEqual([]);
    expect(parsed.urls).toEqual([]);
  });

  it('accepts files without contentPrompt', () => {
    const parsed = parsePipelineStartMultipart(
      [
        {
          buffer: Buffer.from('x'),
          originalname: 'logo.png',
          mimetype: 'image/png',
        } as Express.Multer.File,
      ],
      '',
      undefined,
    );
    expect(parsed.contentPrompt).toBe('');
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].originalname).toBe('logo.png');
  });

  it('parses urls JSON array', () => {
    const parsed = parsePipelineStartMultipart(
      undefined,
      'brief',
      JSON.stringify(['https://example.com/page']),
    );
    expect(parsed.urls).toContain('https://example.com/page');
  });

  it('rejects empty prompt with no files or urls', () => {
    expect(() =>
      parsePipelineStartMultipart(undefined, '   ', undefined),
    ).toThrow(BadRequestException);
  });
});
