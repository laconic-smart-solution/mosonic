import {
  brandImageAssetsFromRuleAssets,
  ensureBrandMarkInSourcePack,
  mergeBrandAssetsIntoSourcePack,
  selectKeepScenePixelAssets,
} from './brand-image-assets.util';
import type { RuleAssetRecord } from '../repositories/interfaces/rule-asset.repository.interface';

function makeAsset(overrides: Partial<RuleAssetRecord> = {}): RuleAssetRecord {
  return {
    ruleAssetId: 'asset-1',
    ruleId: 'rule-1',
    userId: 'user-1',
    type: 'reference_image',
    status: 'ready',
    fileUrl: 'https://files.example.com/a.png',
    relativePath: null,
    originalFileName: 'a.png',
    mimeType: 'image/png',
    fileSize: 100,
    aiDescription: null,
    extractedText: null,
    ragEnabled: false,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RuleAssetRecord;
}

describe('brandImageAssetsFromRuleAssets', () => {
  it('returns [] when there are no ready image assets', () => {
    const assets = brandImageAssetsFromRuleAssets([
      makeAsset({ status: 'processing' }),
      makeAsset({ type: 'guideline_document', status: 'ready' }),
    ]);
    expect(assets).toEqual([]);
  });

  it('puts the ready logo first with role brand_mark', () => {
    const assets = brandImageAssetsFromRuleAssets([
      makeAsset({ ruleAssetId: 'logo-1', type: 'logo', status: 'ready' }),
      makeAsset({ ruleAssetId: 'ref-1', type: 'reference_image', status: 'ready' }),
    ]);
    expect(assets[0]).toMatchObject({ id: 'logo-1', role: 'brand_mark', confidence: 1 });
    expect(assets[1]).toMatchObject({ id: 'ref-1', role: 'product', confidence: 0.8 });
  });

  it('caps reference images at 2', () => {
    const assets = brandImageAssetsFromRuleAssets([
      makeAsset({ ruleAssetId: 'ref-1' }),
      makeAsset({ ruleAssetId: 'ref-2' }),
      makeAsset({ ruleAssetId: 'ref-3' }),
    ]);
    expect(assets).toHaveLength(2);
  });

  it('skips assets with no fileUrl', () => {
    const assets = brandImageAssetsFromRuleAssets([
      makeAsset({ type: 'logo', status: 'ready', fileUrl: '' }),
    ]);
    expect(assets).toEqual([]);
  });

  it('keeps a logo that only has a file-service relativePath', () => {
    const assets = brandImageAssetsFromRuleAssets([
      makeAsset({
        type: 'logo',
        status: 'ready',
        fileUrl: '',
        relativePath: 'rule-assets/logo.png',
      }),
    ]);
    expect(assets[0]).toMatchObject({
      role: 'brand_mark',
      relativePath: 'rule-assets/logo.png',
    });
  });

  it('treats a ready reference named logo as brand_mark when type=logo is missing', () => {
    const assets = brandImageAssetsFromRuleAssets([
      makeAsset({
        ruleAssetId: 'named-logo',
        type: 'reference_image',
        originalFileName: 'WISER-ACC-logo.png',
      }),
    ]);
    expect(assets[0]).toMatchObject({ id: 'named-logo', role: 'brand_mark' });
  });
});

describe('ensureBrandMarkInSourcePack', () => {
  it('inserts the logo after the current photo so a full pack cannot drop it', () => {
    const fillers = [1, 2, 3, 4].map((n) => ({
      id: `p${n}`,
      kind: 'image' as const,
      label: `p${n}`,
      fileUrl: `https://files.example.com/p${n}.png`,
      role: 'product' as const,
      confidence: 0.5,
    }));
    const pack = {
      notes: '',
      assets: [
        {
          id: 'previous_output',
          kind: 'image' as const,
          label: 'previous_output',
          fileUrl: 'https://files.example.com/prev.png',
          role: 'enhance' as const,
          confidence: 1,
        },
        ...fillers,
      ],
    };
    const merged = ensureBrandMarkInSourcePack(pack, [
      {
        id: 'logo-1',
        kind: 'image',
        label: 'logo',
        fileUrl: 'https://files.example.com/logo.png',
        role: 'brand_mark',
        confidence: 1,
      },
    ]);
    expect(merged?.assets.map((asset) => asset.id)).toEqual([
      'previous_output',
      'logo-1',
      'p1',
      'p2',
      'p3',
      'p4',
    ]);
    expect(
      selectKeepScenePixelAssets(merged, true).map((asset) => asset.id),
    ).toEqual(['previous_output', 'logo-1']);
  });
});

describe('mergeBrandAssetsIntoSourcePack', () => {
  it('returns the original sourcePack unchanged when there are no brand assets', () => {
    const sourcePack = { notes: 'x', assets: [] };
    expect(mergeBrandAssetsIntoSourcePack(sourcePack, [])).toBe(sourcePack);
  });

  it('appends brand assets onto an existing sourcePack without mutating it', () => {
    const sourcePack = { notes: 'x', assets: [{ id: 'a', kind: 'image' as const, label: 'a', role: 'context_only' as const, confidence: 1 }] };
    const brandAsset = { id: 'logo-1', kind: 'image' as const, label: 'logo', role: 'brand_mark' as const, confidence: 1 };

    const merged = mergeBrandAssetsIntoSourcePack(sourcePack, [brandAsset]);

    expect(merged).not.toBe(sourcePack);
    expect(sourcePack.assets).toHaveLength(1);
    expect(merged?.assets).toEqual([sourcePack.assets[0], brandAsset]);
  });

  it('builds a fresh sourcePack when the input is null', () => {
    const brandAsset = { id: 'logo-1', kind: 'image' as const, label: 'logo', role: 'brand_mark' as const, confidence: 1 };
    const merged = mergeBrandAssetsIntoSourcePack(null, [brandAsset]);
    expect(merged).toEqual({ notes: '', assets: [brandAsset] });
  });
});
