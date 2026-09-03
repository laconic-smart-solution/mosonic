import { NotFoundException } from '@nestjs/common';
import { AdminImageTemplatesService } from './admin-image-templates.service';

describe('AdminImageTemplatesService', () => {
  function makePrisma(overrides: Record<string, unknown> = {}) {
    return {
      imageTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ imageTemplateId: 'id1' }),
        create: jest.fn().mockResolvedValue({ imageTemplateId: 'id1' }),
        update: jest.fn().mockResolvedValue({ imageTemplateId: 'id1' }),
        delete: jest.fn().mockResolvedValue({ imageTemplateId: 'id1' }),
        ...overrides,
      },
    };
  }

  it('lists all rows ordered by name', async () => {
    const prisma = makePrisma();
    const svc = new AdminImageTemplatesService(prisma as never);

    await svc.list();

    expect(prisma.imageTemplate.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
    });
  });

  it('creates a template with trimmed fields', async () => {
    const prisma = makePrisma();
    const svc = new AdminImageTemplatesService(prisma as never);

    await svc.create({
      key: 'ad_creative',
      name: ' Ad Creative ',
      description: ' d ',
      prompt: ' p ',
      imageUrl: 'https://files.example.com/a.png',
      isActive: true,
    });

    expect(prisma.imageTemplate.create).toHaveBeenCalledWith({
      data: {
        key: 'ad_creative',
        name: 'Ad Creative',
        description: 'd',
        prompt: 'p',
        imageUrl: 'https://files.example.com/a.png',
        isActive: true,
      },
    });
  });

  it('updates an existing template', async () => {
    const prisma = makePrisma();
    const svc = new AdminImageTemplatesService(prisma as never);

    await svc.update('id1', {
      name: 'Updated',
      description: 'd',
      prompt: 'p',
      isActive: false,
    });

    expect(prisma.imageTemplate.update).toHaveBeenCalledWith({
      where: { imageTemplateId: 'id1' },
      data: {
        name: 'Updated',
        description: 'd',
        prompt: 'p',
        imageUrl: undefined,
        isActive: false,
      },
    });
  });

  it('throws NotFoundException when updating a missing template', async () => {
    const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(null) });
    const svc = new AdminImageTemplatesService(prisma as never);

    await expect(
      svc.update('missing', {
        name: 'x',
        description: 'x',
        prompt: 'x',
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an existing template', async () => {
    const prisma = makePrisma();
    const svc = new AdminImageTemplatesService(prisma as never);

    const out = await svc.delete('id1');

    expect(prisma.imageTemplate.delete).toHaveBeenCalledWith({
      where: { imageTemplateId: 'id1' },
    });
    expect(out).toEqual({ success: true });
  });

  it('throws NotFoundException when deleting a missing template', async () => {
    const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(null) });
    const svc = new AdminImageTemplatesService(prisma as never);

    await expect(svc.delete('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
