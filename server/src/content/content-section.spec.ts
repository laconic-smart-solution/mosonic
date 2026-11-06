jest.mock('../common/utils/toon.util', () => ({
  toPromptToon: (data: unknown) => JSON.stringify(data),
}));
jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(),
}));
jest.mock('jose', () => ({
  SignJWT: class SignJWT {},
  jwtVerify: jest.fn(),
}));
jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));
jest.mock('../upload/upload.service', () => ({
  UploadService: class UploadService {},
}));

import { NotFoundException } from '@nestjs/common';
import { ContentService } from './content.service';
import { ContentStatus } from './schemas/content.schema';

describe('ContentService - Structured Section Management', () => {
  let service: ContentService;
  let mockContentRepo: any;
  let mockRulesRepo: any;
  let mockPipelinesRepo: any;
  let mockWorkflowNodesRepo: any;
  let mockTextGeneration: any;

  const mockAuth = {
    userId: 'user_123',
    tenantId: 'tenant_123',
    role: 'owner',
  } as any;

  beforeEach(() => {
    mockContentRepo = {
      findById: jest.fn(),
      updateEditableState: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      findByIdLean: jest.fn(),
    };
    mockRulesRepo = {
      findById: jest.fn(),
    };
    mockPipelinesRepo = {
      findById: jest.fn(),
    };
    mockWorkflowNodesRepo = {
      findByWorkflow: jest.fn().mockResolvedValue([]),
    };
    mockTextGeneration = {
      generateText: jest.fn().mockResolvedValue({
        text: 'Brand New Dynamic Headline',
      }),
    };

    service = new ContentService(
      mockContentRepo,
      {} as any, // events
      {} as any, // uploadService
      {} as any, // workflowService
      {} as any, // nodeExecutor
      {} as any, // sourcePackBuilder
      {} as any, // creditService
      {} as any, // nodeCreditPriceService
      {} as any, // creditCalculation
      {} as any, // contentCreditUsage
      mockPipelinesRepo,
      mockWorkflowNodesRepo,
      mockRulesRepo,
      {} as any, // userPlans
      mockTextGeneration,
    );
  });

  describe('updateSection', () => {
    it('updates an individual section, recompiles Markdown text, and persists', async () => {
      const initialDoc = {
        id: 'content_1',
        ruleRef: 'rule_1',
        pipelineRef: 'pipe_1',
        workflowRef: 'wf_1',
        status: ContentStatus.Draft,
        outputs: {
          sections: [
            { key: 'headline', title: 'Old Headline', kind: 'heading', content: 'Old Headline Text' },
            { key: 'features', title: 'Features', kind: 'bullet_list', items: ['Feature 1', 'Feature 2'] },
          ],
          text: '### Old Headline\nOld Headline Text\n\n**Features**\n• Feature 1\n• Feature 2',
        },
      };

      mockContentRepo.findById.mockResolvedValue(initialDoc);

      const result = await service.updateSection(
        'content_1',
        'headline',
        { content: 'Brand New Headline Content' },
        mockAuth,
      );

      expect(result.success).toBe(true);
      expect(result.section.content).toBe('Brand New Headline Content');
      expect(result.compiledText).toContain('Brand New Headline Content');
      expect(result.compiledText).toContain('• Feature 1');

      expect(mockContentRepo.updateEditableState).toHaveBeenCalledWith(
        'content_1',
        expect.objectContaining({
          outputs: expect.objectContaining({
            text: expect.stringContaining('Brand New Headline Content'),
            sections: expect.arrayContaining([
              expect.objectContaining({ key: 'headline', content: 'Brand New Headline Content' }),
            ]),
          }),
        }),
        mockAuth,
      );
    });

    it('throws NotFoundException if sectionKey does not exist in content', async () => {
      const initialDoc = {
        id: 'content_1',
        outputs: {
          sections: [{ key: 'headline', title: 'Headline', kind: 'heading', content: 'H1' }],
        },
      };
      mockContentRepo.findById.mockResolvedValue(initialDoc);

      await expect(
        service.updateSection('content_1', 'non_existent_key', { content: 'test' }, mockAuth),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('regenerateSection', () => {
    it('regenerates a single section via TextGenerationService while preserving other sections', async () => {
      const initialDoc = {
        id: 'content_1',
        ruleRef: 'rule_1',
        pipelineRef: 'pipe_1',
        workflowRef: 'wf_1',
        status: ContentStatus.Draft,
        outputs: {
          sections: [
            { key: 'headline', title: 'Old Headline', kind: 'heading', content: 'Old Headline Text' },
            { key: 'cta', title: 'Call to Action', kind: 'call_to_action', content: 'Old CTA' },
          ],
          text: '### Old Headline\nOld Headline Text\n\nOld CTA',
        },
      };

      mockContentRepo.findById.mockResolvedValue(initialDoc);
      mockRulesRepo.findById.mockResolvedValue({
        brand: { brandName: 'Apex Audio' },
      });

      const result = await service.regenerateSection(
        'content_1',
        'headline',
        { userInstruction: 'Make it bolder and punchier' },
        mockAuth,
      );

      expect(mockTextGeneration.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          contentPrompt: expect.stringContaining('Make it bolder and punchier'),
        }),
      );

      expect(result.success).toBe(true);
      expect(result.section.content).toBe('Brand New Dynamic Headline');
      // Verify other section was preserved
      expect(result.compiledText).toContain('Old CTA');
      expect(result.compiledText).toContain('Brand New Dynamic Headline');
    });
  });
});
