import { mergeRerunSourcePack } from './content-rerun-source-pack.util';
import { emptySourcePack } from '../pipeline/source-pack.types';

describe('mergeRerunSourcePack', () => {
  it('keeps existing pack when fresh is empty', () => {
    const existing = {
      notes: 'old notes',
      assets: [
        {
          id: '1',
          kind: 'image' as const,
          label: 'logo.png',
          fileUrl: 'https://x/logo',
          role: 'brand_mark' as const,
          confidence: 0.9,
        },
      ],
    };
    expect(mergeRerunSourcePack(existing, emptySourcePack())).toEqual(existing);
  });

  it('prefers fresh assets and concatenates notes', () => {
    const existing = {
      notes: 'old',
      assets: [
        {
          id: '1',
          kind: 'image' as const,
          label: 'old.png',
          fileUrl: 'https://x/old',
          role: 'product' as const,
          confidence: 0.5,
        },
      ],
    };
    const fresh = {
      notes: 'new product shot',
      assets: [
        {
          id: '2',
          kind: 'image' as const,
          label: 'new.png',
          fileUrl: 'https://x/new',
          role: 'product' as const,
          confidence: 0.9,
        },
      ],
    };
    expect(mergeRerunSourcePack(existing, fresh)).toEqual({
      notes: 'new product shot\n\nold',
      assets: fresh.assets,
    });
  });
});
