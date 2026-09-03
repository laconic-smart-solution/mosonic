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
      });
    });

    it('excludes generate-more nodes when templateOnly is true', async () => {
      const prisma = makePrisma();
      const repo = new PrismaWorkflowNodeRepository(prisma as never);

      await repo.findByWorkflow('wf1', undefined, { templateOnly: true });

      expect(prisma.workflowNode.findMany).toHaveBeenCalledWith({
        where: { workflowRef: 'wf1', isGenerateMoreOnly: false },
        orderBy: { order: 'asc' },
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
});
