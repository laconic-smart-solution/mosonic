import {
  forcePreviousImageFirst,
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

  it('treats "recreate ... in editorial design" as a full redo, not a tweak', () => {
    expect(
      isImageRerunStartFresh(
        'Recreate the image in a premium editorial design style. Use a magazine-like layout...',
      ),
    ).toBe(true);
  });

  it('treats redesign/reimagine/new layout as a full redo', () => {
    expect(isImageRerunStartFresh('redesign this completely')).toBe(true);
    expect(isImageRerunStartFresh('reimagine it as a poster')).toBe(true);
    expect(isImageRerunStartFresh('give it a new layout')).toBe(true);
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

  it('forces the previous image first even when the message says redesign', () => {
    const pack = forcePreviousImageFirst(emptySourcePack(), prevUrl);
    expect(pack.assets[0]).toMatchObject({
      id: 'previous_output',
      fileUrl: prevUrl,
      role: 'enhance',
    });
  });
});
