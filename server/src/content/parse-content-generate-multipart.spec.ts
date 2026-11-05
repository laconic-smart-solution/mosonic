import { parseContentGenerateMultipart } from './parse-content-generate-multipart';

describe('parseContentGenerateMultipart', () => {
  it('parses type, message, and files', () => {
    const parsed = parseContentGenerateMultipart(
      [
        {
          buffer: Buffer.from('x'),
          originalname: 'logo.png',
          mimetype: 'image/png',
        } as Express.Multer.File,
      ],
      {
        type: 'image_generation',
        message: ' warmer lighting ',
        config: JSON.stringify({ template: 'lifestyle' }),
      },
    );
    expect(parsed.dto.type).toBe('image_generation');
    expect(parsed.dto.message).toBe('warmer lighting');
    expect(parsed.dto.config).toEqual({ template: 'lifestyle' });
    expect(parsed.files).toHaveLength(1);
  });
});
