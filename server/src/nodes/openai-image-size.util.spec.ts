import {
  aspectRatioToOpenAiImageSize,
  coerceOpenAiImageSize,
  isValidOpenAiImageSizeForModel,
} from './openai-image-size.util';

describe('aspectRatioToOpenAiImageSize', () => {
  it('uses DALL·E 3 geometry for dall-e-3', () => {
    expect(aspectRatioToOpenAiImageSize('16:9', 'dall-e-3')).toBe('1792x1024');
    expect(aspectRatioToOpenAiImageSize('9:16', 'dall-e-3')).toBe('1024x1792');
  });

  it('uses gpt-image-1 geometry for gpt-image-1', () => {
    expect(aspectRatioToOpenAiImageSize('16:9', 'gpt-image-1')).toBe(
      '1536x1024',
    );
    expect(aspectRatioToOpenAiImageSize('9:16', 'gpt-image-1')).toBe(
      '1024x1536',
    );
  });
});

describe('coerceOpenAiImageSize', () => {
  it('maps legacy wide DALL·E 3 size to gpt-image-1 landscape', () => {
    expect(coerceOpenAiImageSize('1792x1024', 'gpt-image-1')).toBe('1536x1024');
  });

  it('maps legacy tall DALL·E 3 size to gpt-image-1 portrait', () => {
    expect(coerceOpenAiImageSize('1024x1792', 'gpt-image-1')).toBe(
      '1024x1536',
    );
  });

  it('preserves valid gpt-style sizes', () => {
    expect(coerceOpenAiImageSize('1024x1536', 'gpt-image-1')).toBe(
      '1024x1536',
    );
    expect(coerceOpenAiImageSize('auto', 'gpt-image-1')).toBe('auto');
  });
});

describe('isValidOpenAiImageSizeForModel', () => {
  it('rejects 1792x1024 for gpt-image-1', () => {
    expect(isValidOpenAiImageSizeForModel('1792x1024', 'gpt-image-1')).toBe(
      false,
    );
  });

  it('accepts 1792x1024 for dall-e-3', () => {
    expect(isValidOpenAiImageSizeForModel('1792x1024', 'dall-e-3')).toBe(true);
  });
});
