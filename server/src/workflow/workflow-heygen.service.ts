import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../auth/tenancy.types';
import { PrismaService } from '../database/prisma.service';
import {
  HeygenAssetsService,
  type HeygenAvatarLook,
} from '../nodes/services/heygen-assets.service';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  coerceVideoConfigForPersist,
  parseWorkflowNodeConfigOrThrow,
} from '../nodes/workflow-node-config.zod';
import type { IWorkflowNodeRepository } from '../repositories/interfaces/workflow-node.repository.interface';
import type { IWorkflowRepository } from '../repositories/interfaces/workflow.repository.interface';
import {
  WORKFLOW_NODE_REPOSITORY,
  WORKFLOW_REPOSITORY,
} from '../repositories/tokens';

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class WorkflowHeygenService {
  constructor(
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflows: IWorkflowRepository,
    @Inject(WORKFLOW_NODE_REPOSITORY)
    private readonly workflowNodes: IWorkflowNodeRepository,
    private readonly heygen: HeygenAssetsService,
    private readonly prisma: PrismaService,
  ) {}

  private async getVideoNode(
    workflowId: string,
    nodeId: string,
    auth: TenancyAuth,
  ) {
    const workflow = await this.workflows.findById(workflowId, auth);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }
    const node = await this.workflowNodes.findVideoNode(workflowId, nodeId, auth);
    if (!node) {
      throw new NotFoundException(
        `Video node ${nodeId} not found on workflow ${workflowId}`,
      );
    }
    return node;
  }

  private assertImageFile(file: Express.Multer.File | undefined): Express.Multer.File {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!IMAGE_MIMES.has(mime)) {
      throw new BadRequestException(
        'Avatar and background must be PNG or JPEG images',
      );
    }
    if (file.size > 32 * 1024 * 1024) {
      throw new BadRequestException('Image must be 32MB or smaller');
    }
    return file;
  }

  private async recordUserAvatar(args: {
    userId: string;
    lookId: string;
    name: string;
    previewImageUrl?: string;
    assetId?: string;
  }): Promise<void> {
    const userId = args.userId.trim();
    const lookId = args.lookId.trim();
    if (!userId || !lookId) return;

    await this.prisma.heygenUserAvatar.upsert({
      where: { lookId },
      create: {
        userId,
        lookId,
        name: args.name.trim() || 'Avatar',
        previewImageUrl: args.previewImageUrl?.trim() || null,
        avatarType: 'photo_avatar',
        assetId: args.assetId?.trim() || null,
      },
      update: {
        userId,
        name: args.name.trim() || 'Avatar',
        previewImageUrl: args.previewImageUrl?.trim() || null,
        assetId: args.assetId?.trim() || null,
      },
    });
  }

  private async assertAvatarOwnedByUser(
    userId: string,
    lookId: string,
  ): Promise<void> {
    const row = await this.prisma.heygenUserAvatar.findUnique({
      where: { lookId },
      select: { userId: true },
    });
    if (!row || row.userId !== userId) {
      throw new ForbiddenException('Avatar not found');
    }
  }

  private mapStoredAvatar(row: {
    lookId: string;
    name: string;
    previewImageUrl: string | null;
    avatarType: string;
  }): HeygenAvatarLook {
    return {
      lookId: row.lookId,
      name: row.name,
      avatarType: row.avatarType,
      previewImageUrl: row.previewImageUrl ?? undefined,
      deletable: true,
      status: 'completed',
    };
  }

  private async createAvatarFromUpload(
    file: Express.Multer.File | undefined,
    avatarName: string,
  ): Promise<{
    heygenAvatarId: string;
    heygenAvatarAssetId: string;
    previewUrl: string;
  }> {
    const uploadFile = this.assertImageFile(file);
    const { assetId, url } = await this.heygen.uploadAsset(
      uploadFile.buffer,
      uploadFile.mimetype,
      uploadFile.originalname || 'avatar.jpg',
    );

    const { avatarId, previewImageUrl } = await this.heygen.createPhotoAvatar({
      name: avatarName,
      assetId,
    });

    const avatarPhotoUrl = previewImageUrl || url;

    return {
      heygenAvatarId: avatarId,
      heygenAvatarAssetId: assetId,
      previewUrl: avatarPhotoUrl,
    };
  }

  /** Upload avatar to HeyGen without requiring a saved workflow node. */
  async uploadAvatarDraft(
    file: Express.Multer.File | undefined,
    auth: TenancyAuth,
  ) {
    const result = await this.createAvatarFromUpload(
      file,
      `user-${auth.userId}-${Date.now()}`,
    );
    await this.recordUserAvatar({
      userId: auth.userId,
      lookId: result.heygenAvatarId,
      name:
        file?.originalname?.replace(/\.[^.]+$/, '').trim() || 'Uploaded avatar',
      previewImageUrl: result.previewUrl,
      assetId: result.heygenAvatarAssetId,
    });
    return result;
  }

  /** Upload background asset without requiring a saved workflow node. */
  async uploadBackgroundDraft(file: Express.Multer.File | undefined): Promise<{
    heygenBackgroundAssetId: string;
    previewUrl: string;
  }> {
    const uploadFile = this.assertImageFile(file);
    const { assetId, url } = await this.heygen.uploadAsset(
      uploadFile.buffer,
      uploadFile.mimetype,
      uploadFile.originalname || 'background.jpg',
    );
    return {
      heygenBackgroundAssetId: assetId,
      previewUrl: url,
    };
  }

  async uploadAvatar(
    workflowId: string,
    nodeId: string,
    file: Express.Multer.File | undefined,
    auth: TenancyAuth,
  ): Promise<{
    heygenAvatarId: string;
    heygenAvatarAssetId: string;
    previewUrl: string;
  }> {
    const node = await this.getVideoNode(workflowId, nodeId, auth);
    const result = await this.createAvatarFromUpload(
      file,
      `workflow-${workflowId}-${nodeId}`,
    );

    await this.recordUserAvatar({
      userId: auth.userId,
      lookId: result.heygenAvatarId,
      name:
        file?.originalname?.replace(/\.[^.]+$/, '').trim() || 'Uploaded avatar',
      previewImageUrl: result.previewUrl,
      assetId: result.heygenAvatarAssetId,
    });

    const merged = coerceVideoConfigForPersist({
      ...((node.config ?? {}) as Record<string, unknown>),
      mode: 'presenter',
      heygenAvatarId: result.heygenAvatarId,
      heygenAvatarAssetId: result.heygenAvatarAssetId,
      heygenAvatarPhotoUrl: result.previewUrl,
    });
    const config = parseWorkflowNodeConfigOrThrow(
      WorkflowNodeType.VideoGeneration,
      merged,
    );

    await this.workflowNodes.updateConfig(
      workflowId,
      nodeId,
      config as unknown as Prisma.InputJsonValue,
      auth,
    );

    return result;
  }

  async uploadBackground(
    workflowId: string,
    nodeId: string,
    file: Express.Multer.File | undefined,
    auth: TenancyAuth,
  ): Promise<{
    heygenBackgroundAssetId: string;
    previewUrl: string;
  }> {
    const uploadFile = this.assertImageFile(file);
    const node = await this.getVideoNode(workflowId, nodeId, auth);

    const { assetId, url } = await this.heygen.uploadAsset(
      uploadFile.buffer,
      uploadFile.mimetype,
      uploadFile.originalname || 'background.jpg',
    );

    const merged = coerceVideoConfigForPersist({
      ...((node.config ?? {}) as Record<string, unknown>),
      heygenBackgroundAssetId: assetId,
      heygenBackgroundUrl: url,
      removeBackground: true,
    });
    const config = parseWorkflowNodeConfigOrThrow(
      WorkflowNodeType.VideoGeneration,
      merged,
    );

    await this.workflowNodes.updateConfig(
      workflowId,
      nodeId,
      config as unknown as Prisma.InputJsonValue,
      auth,
    );

    return {
      heygenBackgroundAssetId: assetId,
      previewUrl: url,
    };
  }

  listVoicesPage(query?: {
    language?: string;
    gender?: string;
    limit?: number;
    token?: string;
  }) {
    return this.heygen.listVoicesPage(query);
  }

  getVoice(voiceId: string) {
    return this.heygen.getVoice(voiceId);
  }

  streamVoicePreview(voiceId: string) {
    return this.heygen.fetchVoicePreviewAudio(voiceId);
  }

  async listAvatarLooksForUser(userId: string): Promise<HeygenAvatarLook[]> {
    const rows = await this.prisma.heygenUserAvatar.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapStoredAvatar(row));
  }

  async deleteAvatarLookForUser(
    userId: string,
    lookId: string,
  ): Promise<{ lookId: string }> {
    await this.assertAvatarOwnedByUser(userId, lookId);
    const deleted = await this.heygen.deleteAvatarLook(lookId);
    await this.prisma.heygenUserAvatar.deleteMany({
      where: { lookId, userId },
    });
    return deleted;
  }

  /** Merge presenter / video config into the saved workflow node (e.g. voice selection). */
  async patchVideoNodeConfig(
    workflowId: string,
    nodeId: string,
    patch: Record<string, unknown>,
    auth: TenancyAuth,
  ): Promise<Record<string, unknown>> {
    const node = await this.getVideoNode(workflowId, nodeId, auth);
    const merged = coerceVideoConfigForPersist({
      ...((node.config ?? {}) as Record<string, unknown>),
      ...patch,
    } as Record<string, unknown>);
    let config;
    try {
      config = parseWorkflowNodeConfigOrThrow(
        WorkflowNodeType.VideoGeneration,
        merged,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(message);
    }
    await this.workflowNodes.updateConfig(
      workflowId,
      nodeId,
      config as unknown as Prisma.InputJsonValue,
      auth,
    );
    return config as unknown as Record<string, unknown>;
  }
}
