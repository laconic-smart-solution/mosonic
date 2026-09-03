import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type {
  AdminCreateImageTemplateDto,
  AdminUpdateImageTemplateDto,
} from '../dto/admin-image-template.dto';

/**
 * `imageUrl` is never client-supplied — the controller resolves it from an
 * uploaded file via `UploadMediaService` before calling into this service.
 */
export type CreateImageTemplateInput = AdminCreateImageTemplateDto & {
  imageUrl?: string;
};
export type UpdateImageTemplateInput = AdminUpdateImageTemplateDto & {
  imageUrl?: string;
};

/**
 * Admin CRUD over `image_templates`. Unlike the pipeline-facing
 * `ImageTemplateResolverService`, this returns raw DB state (including
 * inactive rows) with no fallback — an admin needs to see reality.
 */
@Injectable()
export class AdminImageTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.imageTemplate.findMany({ orderBy: { name: 'asc' } });
  }

  create(input: CreateImageTemplateInput) {
    return this.prisma.imageTemplate.create({
      data: {
        key: input.key,
        name: input.name.trim(),
        description: input.description.trim(),
        prompt: input.prompt.trim(),
        imageUrl: input.imageUrl,
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(imageTemplateId: string, input: UpdateImageTemplateInput) {
    await this.ensureExists(imageTemplateId);
    return this.prisma.imageTemplate.update({
      where: { imageTemplateId },
      data: {
        name: input.name.trim(),
        description: input.description.trim(),
        prompt: input.prompt.trim(),
        // undefined (no new file uploaded) leaves the existing image untouched.
        imageUrl: input.imageUrl,
        isActive: input.isActive,
      },
    });
  }

  async delete(imageTemplateId: string) {
    await this.ensureExists(imageTemplateId);
    await this.prisma.imageTemplate.delete({ where: { imageTemplateId } });
    return { success: true };
  }

  private async ensureExists(imageTemplateId: string) {
    const row = await this.prisma.imageTemplate.findUnique({
      where: { imageTemplateId },
      select: { imageTemplateId: true },
    });
    if (!row) {
      throw new NotFoundException(`Image template ${imageTemplateId} not found`);
    }
  }
}
