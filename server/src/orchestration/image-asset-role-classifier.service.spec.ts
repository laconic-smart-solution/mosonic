import { ImageAssetRoleClassifierService } from './image-asset-role-classifier.service';

describe('ImageAssetRoleClassifierService', () => {
  const llm = {
    assertProviderCapability: jest.fn(),
    getChatModelForPlainText: jest.fn(),
  };

  const svc = new ImageAssetRoleClassifierService(llm as never);

  describe('heuristicRole', () => {
    it('maps logo cues to brand_mark', () => {
      expect(svc.heuristicRole('Use this logo on the poster', 'mark.png')).toBe(
        'brand_mark',
      );
    });

    it('maps product cues to product', () => {
      expect(
        svc.heuristicRole('Generate an ad for this product bottle', 'shot.jpg'),
      ).toBe('product');
    });

    it('maps vague dual photos to context_only', () => {
      expect(svc.heuristicRole('Make something nice', 'IMG_001.jpg')).toBe(
        'context_only',
      );
      expect(svc.heuristicRole('here are two photos', 'a.png')).toBe(
        'context_only',
      );
    });

    it('maps enhance cues', () => {
      expect(
        svc.heuristicRole('Please remove background and improve this', 'x.png'),
      ).toBe('enhance');
    });
  });

  it('defaults uncertain LLM misses via heuristic when classify falls back', async () => {
    llm.getChatModelForPlainText.mockReturnValue({
      invoke: jest.fn().mockRejectedValue(new Error('vision down')),
    });

    const result = await svc.classify({
      userPrompt: 'create an ad',
      brandName: 'Mosonic',
      images: [
        {
          id: 'i1',
          label: 'company-logo.png',
          mime: 'image/png',
          base64: 'aaa',
        },
        {
          id: 'i2',
          label: 'product-bottle.jpg',
          mime: 'image/jpeg',
          base64: 'bbb',
        },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('brand_mark');
    expect(result[1].role).toBe('product');
  });
});
