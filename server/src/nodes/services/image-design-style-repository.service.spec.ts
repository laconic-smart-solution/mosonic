import { ImageDesignStyleRepositoryService } from './image-design-style-repository.service';

describe('ImageDesignStyleRepositoryService', () => {
  describe('listActive', () => {
    it('returns DB rows when present', async () => {
      const rows = [
        { key: 'cyberpunk', name: 'Cyberpunk', description: 'd', prompt: 'p' },
      ];
      const prisma = {
        imageDesignStyle: { findMany: jest.fn().mockResolvedValue(rows) },
      };
      const svc = new ImageDesignStyleRepositoryService(prisma as never);

      expect(await svc.listActive()).toEqual(rows);
    });

    it('falls back to a single safe default when the table is empty', async () => {
      const prisma = {
        imageDesignStyle: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const svc = new ImageDesignStyleRepositoryService(prisma as never);

      const out = await svc.listActive();

      expect(out).toHaveLength(1);
      expect(out[0].key).toBe('minimalism');
    });

    it('falls back to a single safe default when the DB throws', async () => {
      const prisma = {
        imageDesignStyle: {
          findMany: jest.fn().mockRejectedValue(new Error('db down')),
        },
      };
      const svc = new ImageDesignStyleRepositoryService(prisma as never);

      const out = await svc.listActive();

      expect(out).toHaveLength(1);
      expect(out[0].key).toBe('minimalism');
    });
  });

  describe('getByKey', () => {
    it('returns the DB row when found', async () => {
      const row = {
        key: 'cyberpunk',
        name: 'Cyberpunk',
        description: 'd',
        prompt: 'p',
      };
      const prisma = {
        imageDesignStyle: { findUnique: jest.fn().mockResolvedValue(row) },
      };
      const svc = new ImageDesignStyleRepositoryService(prisma as never);

      expect(await svc.getByKey('cyberpunk')).toEqual(row);
    });

    it('returns null for an unknown key when the DB has no row', async () => {
      const prisma = {
        imageDesignStyle: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const svc = new ImageDesignStyleRepositoryService(prisma as never);

      expect(await svc.getByKey('does-not-exist')).toBeNull();
    });

    it('returns the safe default for the fallback key when the DB throws', async () => {
      const prisma = {
        imageDesignStyle: {
          findUnique: jest.fn().mockRejectedValue(new Error('db down')),
        },
      };
      const svc = new ImageDesignStyleRepositoryService(prisma as never);

      const out = await svc.getByKey('minimalism');

      expect(out?.key).toBe('minimalism');
    });
  });
});
