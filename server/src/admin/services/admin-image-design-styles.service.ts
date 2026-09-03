import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type {
  AdminCreateImageDesignStyleDto,
  AdminUpdateImageDesignStyleDto,
} from '../dto/admin-image-design-style.dto';

/**
 * `imageUrl` is never client-supplied — the controller resolves it from an
 * uploaded file via `UploadMediaService` before calling into this service.
 */
export type CreateImageDesignStyleInput = AdminCreateImageDesignStyleDto & {
  imageUrl?: string;
};
export type UpdateImageDesignStyleInput = AdminUpdateImageDesignStyleDto & {
  imageUrl?: string;
};

/**
 * Admin CRUD over `image_design_styles`. Unlike the pipeline-facing
 * `ImageDesignStyleRepositoryService`, this returns raw DB state (including
 * inactive rows) with no fallback — an admin needs to see reality.
 */
@Injectable()
export class AdminImageDesignStylesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.imageDesignStyle.findMany({ orderBy: { name: 'asc' } });
  }

  create(input: CreateImageDesignStyleInput) {
    return this.prisma.imageDesignStyle.create({
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

  async update(
    imageDesignStyleId: string,
    input: UpdateImageDesignStyleInput,
  ) {
    await this.ensureExists(imageDesignStyleId);
    return this.prisma.imageDesignStyle.update({
      where: { imageDesignStyleId },
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

  async delete(imageDesignStyleId: string) {
    await this.ensureExists(imageDesignStyleId);
    await this.prisma.imageDesignStyle.delete({
      where: { imageDesignStyleId },
    });
    return { success: true };
  }

  private async ensureExists(imageDesignStyleId: string) {
    const row = await this.prisma.imageDesignStyle.findUnique({
      where: { imageDesignStyleId },
      select: { imageDesignStyleId: true },
    });
    if (!row) {
      throw new NotFoundException(
        `Image design style ${imageDesignStyleId} not found`,
      );
    }
  }
}
