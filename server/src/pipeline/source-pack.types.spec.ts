import {
  emptySourcePack,
  parsePipelineSourcePack,
  pixelAssetsFromPack,
} from './source-pack.types';

describe('source-pack.types', () => {
  it('emptySourcePack has empty notes and assets', () => {
    expect(emptySourcePack()).toEqual({ notes: '', assets: [] });
  });

  it('parsePipelineSourcePack returns null for invalid input', () => {
    expect(parsePipelineSourcePack(null)).toBeNull();
    expect(parsePipelineSourcePack('x')).toBeNull();
    expect(parsePipelineSourcePack([])).toBeNull();
  });

  it('parsePipelineSourcePack defaults unknown roles to context_only', () => {
    const pack = parsePipelineSourcePack({
      notes: 'hello',
      assets: [
        {
          id: '1',
          kind: 'image',
          label: 'a.png',
          role: 'not_a_role',
          confidence: 0.8,
        },
      ],
    });
    expect(pack?.notes).toBe('hello');
    expect(pack?.assets[0].role).toBe('context_only');
  });

  it('pixelAssetsFromPack excludes context_only and caps at max', () => {
    const pack = parsePipelineSourcePack({
      notes: '',
      assets: [
        {
          id: '1',
          kind: 'image',
          label: 'a',
          fileUrl: 'https://x/a',
          role: 'product',
          confidence: 1,
        },
        {
          id: '2',
          kind: 'image',
          label: 'b',
          fileUrl: 'https://x/b',
          role: 'context_only',
          confidence: 1,
        },
        {
          id: '3',
          kind: 'image',
          label: 'c',
          fileUrl: 'https://x/c',
          role: 'brand_mark',
          confidence: 1,
        },
        {
          id: '4',
          kind: 'file',
          label: 'd.pdf',
          role: 'product',
          confidence: 1,
        },
        {
          id: '5',
          kind: 'image',
          label: 'e',
          fileUrl: 'https://x/e',
          role: 'identity',
          confidence: 1,
        },
      ],
    });
    const pixels = pixelAssetsFromPack(pack, 2);
    expect(pixels.map((a) => a.id)).toEqual(['1', '3']);
  });

  it('pixelAssetsFromPack keeps images that only have a relativePath', () => {
    const pack = parsePipelineSourcePack({
      notes: '',
      assets: [
        {
          id: 'logo',
          kind: 'image',
          label: 'logo.png',
          relativePath: 'rule-assets/logo.png',
          role: 'brand_mark',
          confidence: 1,
        },
      ],
    });
    expect(pixelAssetsFromPack(pack).map((a) => a.id)).toEqual(['logo']);
  });
});
