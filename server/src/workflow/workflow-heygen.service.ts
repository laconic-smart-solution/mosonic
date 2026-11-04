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
import { fetchUrlToBuffer } from '../upload/fetch-url-to-buffer.util';
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
    const node = await this.workflowNodes.findVideoNode(
      workflowId,
      nodeId,
      auth,
    );
    if (!node) {
      throw new NotFoundException(
        `Video node ${nodeId} not found on workflow ${workflowId}`,
      );
    }
    return node;
  }

  private assertImageFile(
    file: Express.Multer.File | undefined,
  ): Express.Multer.File {
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
    if (node.type === WorkflowNodeType.VideoCinematic) {
      throw new BadRequestException(
        'Avatars belong to a Presenter video step, not a Cinematic one.',
      );
    }
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

    const merged = coerceVideoConfigForPersist(
      {
      ...((node.config ?? {}) as Record<string, unknown>),
      mode: 'presenter',
      heygenAvatarId: result.heygenAvatarId,
      heygenAvatarAssetId: result.heygenAvatarAssetId,
      heygenAvatarPhotoUrl: result.previewUrl,
      },
      node.type,
    );
    const config = parseWorkflowNodeConfigOrThrow(
      node.type as WorkflowNodeType,
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

    const merged = coerceVideoConfigForPersist(
      {
      ...((node.config ?? {}) as Record<string, unknown>),
      heygenBackgroundAssetId: assetId,
      heygenBackgroundUrl: url,
      removeBackground: true,
      },
      node.type,
    );
    const config = parseWorkflowNodeConfigOrThrow(
      node.type as WorkflowNodeType,
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

  /** Stock / account HeyGen looks (HeyGen API). */
  listAccountLooks(): Promise<HeygenAvatarLook[]> {
    return this.heygen.listAvatarLooks();
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
    const merged = coerceVideoConfigForPersist(
      {
      ...((node.config ?? {}) as Record<string, unknown>),
      ...patch,
      },
      node.type,
    );
    let config;
    try {
      config = parseWorkflowNodeConfigOrThrow(
        node.type as WorkflowNodeType,
        merged,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(message);
    }
    await this.workflowNodes.updateConfig(workflowId, nodeId, config, auth);
    return config;
  }
  /**
   * Bind a HeyGen look to a presenter / cinematic node from chat (no canvas).
   * `lookId` must be one of the user's saved looks or a HeyGen account look;
   * `imageUrls` (a brand portrait) creates a new photo-avatar look first.
   * Persists through updateConfig, so the typed row + look FK are synced.
   */
  async setVideoNodeLook(
    workflowId: string,
    nodeId: string,
    input: {
      lookId?: string;
      extraLookIds?: string[];
      source?: { ruleAssetId: string; imageUrls: string[]; name: string; mimeType?: string };
    },
    auth: TenancyAuth,
  ): Promise<{
    lookId: string;
    lookIds: string[];
    createdFromRuleAssetId?: string;
    previewUrl?: string;
    config: Record<string, unknown>;
  }> {
    const node = await this.getVideoNode(workflowId, nodeId, auth);
    if (
      node.type !== WorkflowNodeType.VideoCinematic &&
      node.type !== WorkflowNodeType.VideoPresenter
    ) {
      throw new BadRequestException(
        'Looks can be set on video_presenter or video_cinematic steps only.',
      );
    }

    let lookId = input.lookId?.trim() ?? '';
    let previewUrl: string | undefined;
    let assetId: string | undefined;
    if (input.source) {
      const created = await this.createLookFromImageUrls(
        input.source.imageUrls,
        input.source.mimeType,
        input.source.name,
      );
      lookId = created.heygenAvatarId;
      previewUrl = created.previewUrl;
      assetId = created.heygenAvatarAssetId;
      await this.recordUserAvatar({
        userId: auth.userId,
        lookId,
        name: input.source.name,
        previewImageUrl: previewUrl,
        assetId,
      });
    } else {
      if (!lookId) throw new BadRequestException('lookId or ruleAssetId is required');
      await this.assertLookUsable(auth.userId, lookId);
    }

    const extras: string[] = [];
    for (const raw of input.extraLookIds ?? []) {
      const id = raw.trim();
      if (!id || id === lookId || extras.includes(id)) continue;
      await this.assertLookUsable(auth.userId, id);
      extras.push(id);
    }

    const current = { ...((node.config ?? {}) as Record<string, unknown>) };
    const patch: Record<string, unknown> = { heygenAvatarId: lookId };
    if (input.source) {
      patch.heygenLookSourceRuleAssetId = input.source.ruleAssetId;
      if (assetId) patch.heygenAvatarAssetId = assetId;
      if (previewUrl) patch.heygenAvatarPhotoUrl = previewUrl;
    } else {
      delete current.heygenLookSourceRuleAssetId;
      delete current.heygenAvatarAssetId;
      const stored = await this.prisma.heygenUserAvatar.findUnique({
        where: { lookId },
        select: { previewImageUrl: true },
      });
      if (stored?.previewImageUrl) patch.heygenAvatarPhotoUrl = stored.previewImageUrl;
      else delete current.heygenAvatarPhotoUrl;
    }
    const lookIds = [lookId, ...extras].slice(0, 3);
    if (node.type === WorkflowNodeType.VideoCinematic) {
      patch.heygenAvatarIds = lookIds;
    } else {
      delete current.heygenAvatarIds;
    }

    const config = await this.patchVideoNodeConfigFrom(
      workflowId,
      nodeId,
      node.type,
      { ...current, ...patch },
      auth,
    );
    return {
      lookId,
      lookIds,
      ...(input.source ? { createdFromRuleAssetId: input.source.ruleAssetId } : {}),
      ...(previewUrl ? { previewUrl } : {}),
      config,
    };
  }

  private async patchVideoNodeConfigFrom(
    workflowId: string,
    nodeId: string,
    type: string,
    merged: Record<string, unknown>,
    auth: TenancyAuth,
  ): Promise<Record<string, unknown>> {
    let config;
    try {
      config = parseWorkflowNodeConfigOrThrow(
        type as WorkflowNodeType,
        coerceVideoConfigForPersist(merged, type),
      );
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }
    await this.workflowNodes.updateConfig(workflowId, nodeId, config, auth);
    return config as Record<string, unknown>;
  }

  private async assertLookUsable(userId: string, lookId: string): Promise<void> {
    const row = await this.prisma.heygenUserAvatar.findUnique({
      where: { lookId },
      select: { userId: true },
    });
    if (row) {
      if (row.userId !== userId) throw new ForbiddenException('Avatar not found');
      return;
    }
    const looks = await this.heygen.listAvatarLooks();
    if (!looks.some((look) => look.lookId === lookId)) {
      throw new NotFoundException(`HeyGen look ${lookId} not found`);
    }
  }

  private async createLookFromImageUrls(
    urls: string[],
    mimeType: string | undefined,
    name: string,
  ) {
    let lastError: unknown;
    for (const url of urls) {
      try {
        const { buffer, contentType } = await fetchUrlToBuffer(url, {
          timeoutMs: 60_000,
        });
        const mime = (
          IMAGE_MIMES.has(contentType.split(';')[0].trim().toLowerCase())
            ? contentType.split(';')[0].trim()
            : mimeType || 'image/jpeg'
        ).toLowerCase();
        return await this.createAvatarFromUpload(
          {
            buffer,
            mimetype: mime,
            size: buffer.length,
            originalname: `${name || 'brand-portrait'}.${mime.includes('png') ? 'png' : 'jpg'}`,
          } as Express.Multer.File,
          name || 'Brand portrait',
        );
      } catch (e) {
        lastError = e;
      }
    }
    if (lastError instanceof Error && 'getStatus' in lastError) throw lastError;
    throw new BadRequestException(
      `Could not read that brand image${lastError instanceof Error ? `: ${lastError.message}` : ''}`,
    );
  }
}

