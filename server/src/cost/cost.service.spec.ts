import { CostService } from './cost.service';
import type { RecordCostDto } from './dto/record-cost.dto';

function dto(p: Partial<RecordCostDto> & Pick<RecordCostDto, 'entryType'>): RecordCostDto {
  return {
    userId: 'user-1',
    pipelineRef: 'pipe-1',
    campaignRef: 'rule-1',
    provider: 'openai',
    providerModel: 'gpt-4o',
    ...p,
  } as RecordCostDto;
}

describe('CostService', () => {
  const service = new CostService(
    {} as never,
    {} as never,
    {} as never,
    { emitToPipeline: jest.fn() } as never,
    {} as never,
  );

  describe('calculateCost', () => {
    it('computes OpenAI LLM cost from token usage', () => {
      const cost = service.calculateCost(
        dto({
          entryType: 'openai_llm',
          providerModel: 'gpt-4o',
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
        }),
      );
      expect(cost).toBeCloseTo(2.5 + 10.0, 5);
    });

    it('returns 0 for unknown LLM model', () => {
      expect(
        service.calculateCost(
          dto({
            entryType: 'openai_llm',
            providerModel: 'unknown-model-xyz',
            inputTokens: 1000,
            outputTokens: 1000,
          }),
        ),
      ).toBe(0);
    });

    it('estimates whisper cost from audio duration', () => {
      const cost = service.calculateCost(
        dto({
          entryType: 'openai_llm',
          providerModel: 'whisper-1',
          audioDurationSeconds: 120,
        }),
      );
      expect(cost).toBeCloseTo(2 * 0.006, 6);
    });

    it('computes DALL·E image cost', () => {
      const cost = service.calculateCost(
        dto({
          entryType: 'openai_image',
          providerModel: 'dall-e-3',
          imageCount: 2,
          imageSize: '1024x1024',
          imageQuality: 'standard',
        }),
      );
      expect(cost).toBeCloseTo(0.04 * 2, 6);
    });

    it('uses gpt-image default when key missing', () => {
      const cost = service.calculateCost(
        dto({
          entryType: 'openai_image',
          providerModel: 'gpt-image-1',
          imageCount: 1,
          imageSize: '1024x1024',
          imageQuality: 'standard',
        }),
      );
      expect(cost).toBeGreaterThan(0);
    });

    it('computes video cost from model and resolution', () => {
      const cost = service.calculateCost(
        dto({
          entryType: 'openai_video',
          providerModel: 'sora-2',
          videoSeconds: 10,
          videoResolution: '720p',
        }),
      );
      expect(cost).toBeCloseTo(10 * 0.08, 6);
    });

    it('computes Zernio account monthly cost', () => {
      expect(
        service.calculateCost(
          dto({
            entryType: 'zernio_account',
            provider: 'zernio',
            providerModel: 'zernio_account',
            accountCount: 2,
          }),
        ),
      ).toBeCloseTo(12, 5);
    });
  });

  describe('currentBillingPeriod', () => {
    it('returns first day of current month', () => {
      const d = service.currentBillingPeriod();
      expect(d.getDate()).toBe(1);
      expect(d.getHours()).toBe(0);
    });
  });
});
