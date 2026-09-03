import { NotFoundException } from '@nestjs/common';
import { AdminImageDesignStylesService } from './admin-image-design-styles.service';

describe('AdminImageDesignStylesService', () => {
  function makePrisma(overrides: Record<string, unknown> = {}) {
    return {
      imageDesignStyle: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest
          .fn()
          .mockResolvedValue({ imageDesignStyleId: 'id1' }),
        create: jest.fn().mockResolvedValue({ imageDesignStyleId: 'id1' }),
        update: jest.fn().mockResolvedValue({ imageDesignStyleId: 'id1' }),
        delete: jest.fn().mockResolvedValue({ imageDesignStyleId: 'id1' }),
        ...overrides,
      },
    };
  }

  it('lists all rows ordered by name', async () => {
    const prisma = makePrisma();
    const svc = new AdminImageDesignStylesService(prisma as never);

    await svc.list();

    expect(prisma.imageDesignStyle.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
    });
  });

  it('creates a style with trimmed fields', async () => {
    const prisma = makePrisma();
    const svc = new AdminImageDesignStylesService(prisma as never);

    await svc.create({
      key: 'cyberpunk',
      name: ' Cyberpunk ',
      description: ' d ',
      prompt: ' p ',
      imageUrl: 'https://files.example.com/c.png',
      isActive: true,
    });

    expect(prisma.imageDesignStyle.create).toHaveBeenCalledWith({
      data: {
        key: 'cyberpunk',
        name: 'Cyberpunk',
        description: 'd',
        prompt: 'p',
        imageUrl: 'https://files.example.com/c.png',
        isActive: true,
      },
    });
  });

  it('updates an existing style', async () => {
    const prisma = makePrisma();
    const svc = new AdminImageDesignStylesService(prisma as never);

    await svc.update('id1', {
      name: 'Updated',
      description: 'd',
      prompt: 'p',
      isActive: false,
    });

    expect(prisma.imageDesignStyle.update).toHaveBeenCalledWith({
      where: { imageDesignStyleId: 'id1' },
      data: {
        name: 'Updated',
        description: 'd',
        prompt: 'p',
        imageUrl: undefined,
        isActive: false,
      },
    });
  });

  it('throws NotFoundException when updating a missing style', async () => {
    const prisma = makePrisma({
      findUnique: jest.fn().mockResolvedValue(null),
    });
    const svc = new AdminImageDesignStylesService(prisma as never);

    await expect(
      svc.update('missing', {
        name: 'x',
        description: 'x',
        prompt: 'x',
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an existing style', async () => {
    const prisma = makePrisma();
    const svc = new AdminImageDesignStylesService(prisma as never);

    const out = await svc.delete('id1');

    expect(prisma.imageDesignStyle.delete).toHaveBeenCalledWith({
      where: { imageDesignStyleId: 'id1' },
    });
    expect(out).toEqual({ success: true });
  });

  it('throws NotFoundException when deleting a missing style', async () => {
    const prisma = makePrisma({
      findUnique: jest.fn().mockResolvedValue(null),
    });
    const svc = new AdminImageDesignStylesService(prisma as never);

    await expect(svc.delete('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
