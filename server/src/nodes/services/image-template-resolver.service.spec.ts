import { ImageTemplateResolverService } from './image-template-resolver.service';
import { NodeImageTemplate } from '../schemas/workflow-node.schema';

describe('ImageTemplateResolverService', () => {
  describe('resolve', () => {
    it('returns the DB row when active', async () => {
      const prisma = {
        imageTemplate: {
          findUnique: jest.fn().mockResolvedValue({
            key: 'ad_creative',
            name: 'Custom Ad',
            description: 'Custom description',
            prompt: 'Custom prompt',
            isActive: true,
          }),
        },
      };
      const svc = new ImageTemplateResolverService(prisma as never);

      const out = await svc.resolve(NodeImageTemplate.AdCreative);

      expect(out).toEqual({
        name: 'Custom Ad',
        description: 'Custom description',
        prompt: 'Custom prompt',
      });
    });

    it('falls back to the in-code default when the row is inactive', async () => {
      const prisma = {
        imageTemplate: {
          findUnique: jest.fn().mockResolvedValue({
            key: 'ad_creative',
            name: 'Custom Ad',
            description: 'Custom description',
            prompt: 'Custom prompt',
            isActive: false,
          }),
        },
      };
      const svc = new ImageTemplateResolverService(prisma as never);

      const out = await svc.resolve(NodeImageTemplate.AdCreative);

      expect(out.name).toBe('Product Advertisement');
    });

    it('falls back to the in-code default when the DB throws', async () => {
      const prisma = {
        imageTemplate: {
          findUnique: jest.fn().mockRejectedValue(new Error('db down')),
        },
      };
      const svc = new ImageTemplateResolverService(prisma as never);

      const out = await svc.resolve(NodeImageTemplate.Lifestyle);

      expect(out.name).toBe('Lifestyle Photograph');
    });
  });

  describe('listActiveDefinitions', () => {
    it('returns DB rows when present', async () => {
      const prisma = {
        imageTemplate: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { key: 'ad_creative', description: 'Custom ad description' },
            ]),
        },
      };
      const svc = new ImageTemplateResolverService(prisma as never);

      const out = await svc.listActiveDefinitions();

      expect(out).toEqual([
        { key: 'ad_creative', description: 'Custom ad description' },
      ]);
    });

    it('falls back to in-code definitions when the DB is empty', async () => {
      const prisma = {
        imageTemplate: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const svc = new ImageTemplateResolverService(prisma as never);

      const out = await svc.listActiveDefinitions();

      expect(out.length).toBeGreaterThan(0);
      expect(out.some((d) => d.key === 'ad_creative')).toBe(true);
    });
  });

  describe('listActiveForPicker', () => {
    it('returns DB rows with imageUrl when present', async () => {
      const prisma = {
        imageTemplate: {
          findMany: jest.fn().mockResolvedValue([
            {
              key: 'ad_creative',
              name: 'Ad Creative',
              description: 'd',
              imageUrl: 'https://files.example.com/ad.png',
            },
          ]),
        },
      };
      const svc = new ImageTemplateResolverService(prisma as never);

      const out = await svc.listActiveForPicker();

      expect(out).toEqual([
        {
          key: 'ad_creative',
          name: 'Ad Creative',
          description: 'd',
          imageUrl: 'https://files.example.com/ad.png',
        },
      ]);
    });

    it('falls back to in-code definitions with null imageUrl when the DB is empty', async () => {
      const prisma = {
        imageTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const svc = new ImageTemplateResolverService(prisma as never);

      const out = await svc.listActiveForPicker();

      expect(out.length).toBeGreaterThan(0);
      expect(out.every((o) => o.imageUrl === null)).toBe(true);
    });
  });
});
