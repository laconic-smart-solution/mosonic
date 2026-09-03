import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NodeImageTemplate } from '../schemas/workflow-node.schema';

export type ResolvedImageTemplate = {
  name: string;
  description: string;
  prompt: string;
};

export type ImageTemplateDefinition = {
  key: string;
  description: string;
};

export type ImageTemplatePickerOption = {
  key: string;
  name: string;
  description: string;
  imageUrl: string | null;
};

/** Used when the `image_templates` row is missing, inactive, or the DB is unreachable. */
const FALLBACK_TEMPLATES: Record<
  Exclude<NodeImageTemplate, NodeImageTemplate.Auto>,
  ResolvedImageTemplate
> = {
  [NodeImageTemplate.AdCreative]: {
    name: 'Product Advertisement',
    description:
      'Promotional creative for a specific offer, campaign, or call-to-action.',
    prompt:
      'The composition must have one dominant focal subject that reads instantly, even at small mobile sizes. Reserve roughly a third of the frame as clean negative space for a headline overlay to be added later — do not place text inside the scene itself.',
  },
  [NodeImageTemplate.ProductMockup]: {
    name: 'Product Mockup',
    description:
      'Clean, isolated presentation of a physical or digital product.',
    prompt:
      'The product itself must be the dominant visual element. Use controlled, even studio-quality lighting. Keep the background simple and uncluttered so nothing competes with the product.',
  },
  [NodeImageTemplate.Infographic]: {
    name: 'Infographic',
    description:
      'Structured visual for presenting concrete data, steps, or comparisons.',
    prompt:
      'Use a clear, structured layout with generous spacing and an obvious visual hierarchy. Every graphic element must correspond to real information from the source content — never fill space with abstract, unlabeled decoration.',
  },
  [NodeImageTemplate.Photorealistic]: {
    name: 'Photorealistic Scene',
    description:
      'A physically believable photograph-style image with no specific promotional framing.',
    prompt:
      'Render as a physically believable photograph: realistic anatomy, accurate perspective, and natural material response to light.',
  },
  [NodeImageTemplate.Lifestyle]: {
    name: 'Lifestyle Photograph',
    description:
      'An authentic, in-context photograph of people experiencing or using something.',
    prompt:
      'Show real people in a natural environment with believable expressions and body language — favor candid interaction over posed, stock-photo composition.',
  },
};

/**
 * Reads template content from the `image_templates` table — admin-editable
 * content instead of hardcoded TypeScript. Falls back to a fixed in-code
 * definition on any DB failure so image generation never breaks over this.
 */
@Injectable()
export class ImageTemplateResolverService {
  private readonly logger = new Logger(ImageTemplateResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(key: NodeImageTemplate): Promise<ResolvedImageTemplate> {
    const fallback =
      FALLBACK_TEMPLATES[
        key as Exclude<NodeImageTemplate, NodeImageTemplate.Auto>
      ] ?? FALLBACK_TEMPLATES[NodeImageTemplate.Photorealistic];

    try {
      const row = await this.prisma.imageTemplate.findUnique({
        where: { key },
      });
      if (row && row.isActive) {
        return {
          name: row.name,
          description: row.description,
          prompt: row.prompt,
        };
      }
    } catch (err) {
      this.logger.warn(
        `Failed to resolve image template "${key}" from DB: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return fallback;
  }

  /** Definitions for the template classifier's prompt — DB-sourced so the two can't drift. */
  async listActiveDefinitions(): Promise<ImageTemplateDefinition[]> {
    try {
      const rows = await this.prisma.imageTemplate.findMany({
        where: { isActive: true },
        select: { key: true, description: true },
      });
      if (rows.length > 0) {
        return rows;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to list active image templates from DB: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return Object.entries(FALLBACK_TEMPLATES).map(([key, def]) => ({
      key,
      description: def.description,
    }));
  }

  /** Active templates with images, for the node-config picker UI. */
  async listActiveForPicker(): Promise<ImageTemplatePickerOption[]> {
    try {
      const rows = await this.prisma.imageTemplate.findMany({
        where: { isActive: true },
        select: { key: true, name: true, description: true, imageUrl: true },
      });
      if (rows.length > 0) {
        return rows;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to list image templates for picker from DB: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return Object.entries(FALLBACK_TEMPLATES).map(([key, def]) => ({
      key,
      name: def.name,
      description: def.description,
      imageUrl: null,
    }));
  }
}
