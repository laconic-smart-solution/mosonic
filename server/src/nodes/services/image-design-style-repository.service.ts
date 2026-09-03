import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export type ImageDesignStyleRow = {
  key: string;
  name: string;
  description: string;
  prompt: string;
  imageUrl?: string | null;
};

/** Used when the `image_design_styles` table is empty or the DB is unreachable. */
const FALLBACK_STYLE: ImageDesignStyleRow = {
  key: 'minimalism',
  name: 'Minimalism',
  description:
    'Restrained, uncluttered visual language built on negative space and simple geometry.',
  prompt:
    'Restrained composition with generous negative space. Simple, clean geometric forms. Subtle, even lighting. A restrained, limited color palette.',
  imageUrl: null,
};

/**
 * Reads the design-style library from `image_design_styles` — admin-editable
 * content, not hardcoded TypeScript. Falls back to a single safe default
 * style on any DB failure.
 */
@Injectable()
export class ImageDesignStyleRepositoryService {
  private readonly logger = new Logger(ImageDesignStyleRepositoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<ImageDesignStyleRow[]> {
    try {
      const rows = await this.prisma.imageDesignStyle.findMany({
        where: { isActive: true },
        select: {
          key: true,
          name: true,
          description: true,
          prompt: true,
          imageUrl: true,
        },
      });
      if (rows.length > 0) {
        return rows;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to list active image design styles from DB: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return [FALLBACK_STYLE];
  }

  async getByKey(key: string): Promise<ImageDesignStyleRow | null> {
    try {
      const row = await this.prisma.imageDesignStyle.findUnique({
        where: { key },
        select: { key: true, name: true, description: true, prompt: true },
      });
      if (row && row.key) {
        return row;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to resolve image design style "${key}" from DB: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return key === FALLBACK_STYLE.key ? FALLBACK_STYLE : null;
  }
}
