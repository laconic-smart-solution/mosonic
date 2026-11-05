import { TYPED_CONFIG_INCLUDE } from '../../nodes/node-typed-config.util';
import { PrismaWorkflowNodeRepository } from './prisma-workflow-node.repository';

describe('PrismaWorkflowNodeRepository', () => {
  function makePrisma() {
    return {
      workflowNode: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
  }

  describe('findByWorkflow', () => {
    it('queries by workflowRef only when templateOnly is not set', async () => {
      const prisma = makePrisma();
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.findByWorkflow('wf1');

      expect(prisma.workflowNode.findMany).toHaveBeenCalledWith({
        where: { workflowRef: 'wf1' },
        orderBy: { order: 'asc' },
        include: TYPED_CONFIG_INCLUDE,
      });
    });

    it('excludes generate-more nodes when templateOnly is true', async () => {
      const prisma = makePrisma();
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.findByWorkflow('wf1', undefined, { templateOnly: true });

      expect(prisma.workflowNode.findMany).toHaveBeenCalledWith({
        where: { workflowRef: 'wf1', isGenerateMoreOnly: false },
        orderBy: { order: 'asc' },
        include: TYPED_CONFIG_INCLUDE,
      });
    });
  });

  describe('findByWorkflowRefs', () => {
    it('excludes generate-more nodes when templateOnly is true', async () => {
      const prisma = makePrisma();
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.findByWorkflowRefs(['wf1', 'wf2'], undefined, {
        templateOnly: true,
      });

      expect(prisma.workflowNode.findMany).toHaveBeenCalledWith({
        where: {
          workflowRef: { in: ['wf1', 'wf2'] },
          isGenerateMoreOnly: false,
        },
        include: TYPED_CONFIG_INCLUDE,
      });
    });
  });

  describe('deleteByWorkflow', () => {
    it('deletes only template nodes when templateOnly is true', async () => {
      const prisma = makePrisma();
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.deleteByWorkflow('wf1', undefined, { templateOnly: true });

      expect(prisma.workflowNode.deleteMany).toHaveBeenCalledWith({
        where: { workflowRef: 'wf1', isGenerateMoreOnly: false },
      });
    });

    it('deletes all nodes when templateOnly is not set', async () => {
      const prisma = makePrisma();
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.deleteByWorkflow('wf1');

      expect(prisma.workflowNode.deleteMany).toHaveBeenCalledWith({
        where: { workflowRef: 'wf1' },
      });
    });
  });

  describe('typed video config', () => {
    function makeVideoPrisma(overrides: Record<string, unknown> = {}) {
      return {
        workflowNode: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        workflowVideoNodeConfig: {
          upsert: jest.fn().mockResolvedValue({}),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        heygenUserAvatar: { findUnique: jest.fn().mockResolvedValue(null) },
        ruleAsset: { findUnique: jest.fn().mockResolvedValue(null) },
        ...overrides,
      };
    }

    it('overlays typed look onto config JSON on read and strips the relation', async () => {
      const prisma = makeVideoPrisma();
      prisma.workflowNode.findMany.mockResolvedValue([
        {
          nodeId: 'v1',
          type: 'video_cinematic',
          config: { mode: 'cinematic', heygenAvatarId: 'old-look' },
          videoConfig: {
            heygenAvatarId: 'typed-look',
            heygenAvatarIds: ['typed-look', 'b'],
            duration: 8,
            sourceRuleAssetId: 'asset-1',
            mode: null,
          },
        },
        { nodeId: 'i1', type: 'image_generation', config: { size: '1' }, videoConfig: null },
      ]);
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      const [video, image] = await repo.findByWorkflow('wf1');

      expect(video.config).toEqual({
        mode: 'cinematic',
        heygenAvatarId: 'typed-look',
        heygenAvatarIds: ['typed-look', 'b'],
        duration: 8,
        heygenLookSourceRuleAssetId: 'asset-1',
      });
      expect('videoConfig' in video).toBe(false);
      expect(image.config).toEqual({ size: '1' });
    });

    it('reads JSON unchanged when a video node has no typed row (dual-read)', async () => {
      const prisma = makeVideoPrisma();
      prisma.workflowNode.findFirst.mockResolvedValue({
        nodeId: 'v1',
        type: 'video_presenter',
        config: { heygenAvatarId: 'json-look' },
        videoConfig: null,
      });
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      const node = await repo.findVideoNode('wf1', 'v1');

      expect(node?.config).toEqual({ heygenAvatarId: 'json-look' });
    });

    it('dual-writes typed row with look FK on updateConfig', async () => {
      const prisma = makeVideoPrisma();
      prisma.workflowNode.findFirst.mockResolvedValue({
        nodeId: 'v1',
        type: 'video_presenter',
        userId: 'u1',
        config: {
          mode: 'presenter',
          heygenAvatarId: 'look-1',
          heygenVoiceId: 'voice-1',
          duration: 20,
          heygenLookSourceRuleAssetId: 'asset-1',
        },
      });
      prisma.heygenUserAvatar.findUnique.mockResolvedValue({ lookId: 'look-1', userId: 'u1' });
      prisma.ruleAsset.findUnique.mockResolvedValue({ ruleAssetId: 'asset-1' });
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.updateConfig('wf1', 'v1', {});

      expect(prisma.workflowVideoNodeConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { nodeId: 'v1' },
          create: expect.objectContaining({
            nodeId: 'v1',
            heygenAvatarId: 'look-1',
            heygenVoiceId: 'voice-1',
            duration: 20,
            mode: 'presenter',
            userAvatarLookId: 'look-1',
            sourceRuleAssetId: 'asset-1',
          }),
        }),
      );
    });

    it('keeps stock looks as plain id without FK', async () => {
      const prisma = makeVideoPrisma();
      prisma.workflowNode.create.mockResolvedValue({
        nodeId: 'v2',
        type: 'video_cinematic',
        userId: 'u1',
        config: { heygenAvatarIds: ['stock-a', 'stock-b'] , heygenAvatarId: 'stock-a' },
      });
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.create({} as never);

      const arg = prisma.workflowVideoNodeConfig.upsert.mock.calls[0][0];
      expect(arg.create).toEqual(
        expect.objectContaining({
          heygenAvatarId: 'stock-a',
          heygenAvatarIds: ['stock-a', 'stock-b'],
          userAvatarLookId: null,
          sourceRuleAssetId: null,
        }),
      );
    });

    it('drops the typed row when a node is not presenter / cinematic', async () => {
      const prisma = makeVideoPrisma();
      prisma.workflowNode.create.mockResolvedValue({
        nodeId: 'i1',
        type: 'image_generation',
        config: {},
      });
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.create({} as never);

      expect(prisma.workflowVideoNodeConfig.upsert).not.toHaveBeenCalled();
      expect(prisma.workflowVideoNodeConfig.deleteMany).toHaveBeenCalledWith({
        where: { nodeId: 'i1' },
      });
    });
  });
  describe('typed family configs (text / translation / image / media / branch)', () => {
    function makeFamilyPrisma() {
      const table = () => ({
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      });
      return {
        workflowNode: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        workflowVideoNodeConfig: table(),
        workflowTextNodeConfig: table(),
        workflowTranslationNodeConfig: table(),
        workflowImageNodeConfig: table(),
        workflowMediaNodeConfig: table(),
        workflowBranchNodeConfig: table(),
        heygenUserAvatar: { findUnique: jest.fn().mockResolvedValue(null) },
        ruleAsset: { findUnique: jest.fn().mockResolvedValue(null) },
      };
    }

    it('overlays typed image config on read and strips every relation', async () => {
      const prisma = makeFamilyPrisma();
      prisma.workflowNode.findMany.mockResolvedValue([
        {
          nodeId: 'i1',
          type: 'image_generation',
          config: { size: '1024x1024', aspectRatio: '1:1', negativePrompt: 'x' },
          videoConfig: null,
          textConfig: null,
          translationConfig: null,
          imageConfig: { size: '1024x1536', aspectRatio: '9:16', negativePrompt: null },
          mediaConfig: null,
          branchConfig: null,
        },
      ]);
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      const [node] = await repo.findByWorkflow('wf1');

      expect(node.config).toEqual({
        size: '1024x1536',
        aspectRatio: '9:16',
        negativePrompt: 'x',
      });
      for (const rel of ['imageConfig', 'textConfig', 'videoConfig', 'branchConfig']) {
        expect(rel in node).toBe(false);
      }
    });

    it('reads JSON unchanged when a family node has no typed row', async () => {
      const prisma = makeFamilyPrisma();
      prisma.workflowNode.findFirst.mockResolvedValue({
        nodeId: 't1',
        type: 'text_generation',
        config: { model: 'gpt-4o', tone: 'casual' },
        textConfig: null,
      });
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      const node = await repo.findByWorkflowAndNodeId('wf1', 't1');

      expect(node?.config).toEqual({ model: 'gpt-4o', tone: 'casual' });
    });

    it('dual-writes the translation row on updateConfig', async () => {
      const prisma = makeFamilyPrisma();
      prisma.workflowNode.findFirst.mockResolvedValue({
        nodeId: 'tr1',
        type: 'translation',
        config: { targetLanguage: 'th', preserveFormatting: false, model: 'gpt-4o' },
      });
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.updateConfig('wf1', 'tr1', {});

      expect(prisma.workflowTranslationNodeConfig.upsert).toHaveBeenCalledWith({
        where: { nodeId: 'tr1' },
        create: expect.objectContaining({
          nodeId: 'tr1',
          targetLanguage: 'th',
          preserveFormatting: false,
          model: 'gpt-4o',
        }),
        update: expect.objectContaining({ targetLanguage: 'th' }),
      });
      expect(prisma.workflowTextNodeConfig.upsert).not.toHaveBeenCalled();
    });

    it('dual-writes media + branch rows on createMany', async () => {
      const prisma = makeFamilyPrisma();
      (prisma.workflowNode as Record<string, jest.Mock>).createMany = jest
        .fn()
        .mockResolvedValue({ count: 2 });
      prisma.workflowNode.findMany.mockResolvedValue([
        { nodeId: 's1', type: 'subtitle', config: { format: 'vtt', maxCharsPerLine: 40, burnIn: false } },
        { nodeId: 'b1', type: 'branch', config: { mode: 'wizard_channels', channels: ['ig', 'fb'] } },
        { nodeId: 'm1', type: 'merge', config: {} },
      ]);
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.createMany([
        { workflowRef: 'wf1', nodeId: 's1' },
        { workflowRef: 'wf1', nodeId: 'b1' },
        { workflowRef: 'wf1', nodeId: 'm1' },
      ] as never);

      expect(prisma.workflowMediaNodeConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ nodeId: 's1', format: 'vtt', maxCharsPerLine: 40, burnIn: false }),
        }),
      );
      expect(prisma.workflowBranchNodeConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { nodeId: 'b1', mode: 'wizard_channels', channels: ['ig', 'fb'] },
        }),
      );
      // merge has no family table
      expect(prisma.workflowTextNodeConfig.upsert).not.toHaveBeenCalled();
    });

    it('drops the previous family row when upsertNode changes the type', async () => {
      const prisma = makeFamilyPrisma();
      prisma.workflowNode.findFirst.mockResolvedValue({
        nodeId: 'n1',
        type: 'text_generation',
        config: {},
        textConfig: null,
      });
      prisma.workflowNode.update.mockResolvedValue({
        nodeId: 'n1',
        type: 'summarization',
        config: { summaryLength: 'short' },
      });
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.upsertNode('wf1', 'n1', { type: 'summarization' } as never);
      // same family (text) -> no delete, just upsert
      expect(prisma.workflowTextNodeConfig.deleteMany).not.toHaveBeenCalled();
      expect(prisma.workflowTextNodeConfig.upsert).toHaveBeenCalled();

      prisma.workflowNode.update.mockResolvedValue({
        nodeId: 'n1',
        type: 'image_generation',
        config: { size: '1024x1024' },
      });
      await repo.upsertNode('wf1', 'n1', { type: 'image_generation' } as never);
      expect(prisma.workflowTextNodeConfig.deleteMany).toHaveBeenCalledWith({
        where: { nodeId: 'n1' },
      });
      expect(prisma.workflowImageNodeConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ size: '1024x1024' }) }),
      );
    });
  });
});