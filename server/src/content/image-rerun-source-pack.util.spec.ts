import {
  isImageRerunStartFresh,
  resolveImageRerunSourcePack,
} from './image-rerun-source-pack.util';
import { emptySourcePack } from '../pipeline/source-pack.types';

describe('image-rerun-source-pack.util', () => {
  const prevUrl = 'https://files.example.com/prev.png';

  it('detects start-fresh phrases', () => {
    expect(isImageRerunStartFresh('start over with something new')).toBe(true);
    expect(isImageRerunStartFresh('make the background darker')).toBe(false);
  });

  it('does not inject previous when message empty and no new attachments', () => {
    const pack = resolveImageRerunSourcePack({
      sourcePack: emptySourcePack(),
      previousImageUrl: prevUrl,
      rerunMessage: '',
      hadNewAttachments: false,
    });
    expect(pack.assets).toEqual([]);
  });

  it('injects previous as enhance on tweak message', () => {
    const pack = resolveImageRerunSourcePack({
      sourcePack: emptySourcePack(),
      previousImageUrl: prevUrl,
      rerunMessage: 'make the background darker',
      hadNewAttachments: false,
    });
    expect(pack.assets).toEqual([
      expect.objectContaining({
        id: 'previous_output',
        role: 'enhance',
        fileUrl: prevUrl,
        label: 'previous_output',
      }),
    ]);
  });

  it('skips previous on start-over message', () => {
    const pack = resolveImageRerunSourcePack({
      sourcePack: emptySourcePack(),
      previousImageUrl: prevUrl,
      rerunMessage: 'completely different concept please',
      hadNewAttachments: false,
    });
    expect(pack.assets).toEqual([]);
  });

  it('appends previous after new attachments when under cap', () => {
    const pack = resolveImageRerunSourcePack({
      sourcePack: {
        notes: '',
        assets: [
          {
            id: 'logo1',
            kind: 'image',
            label: 'logo.png',
            fileUrl: 'https://files.example.com/logo.png',
            role: 'brand_mark',
            confidence: 0.9,
          },
        ],
      },
      previousImageUrl: prevUrl,
      rerunMessage: '',
      hadNewAttachments: true,
    });
    expect(pack.assets.map((a) => a.id)).toEqual(['logo1', 'previous_output']);
  });
});
