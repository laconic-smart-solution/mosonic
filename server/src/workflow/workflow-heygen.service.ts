import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../auth/tenancy.types';
import { HeygenAssetsService } from '../nodes/services/heygen-assets.service';
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

  /** Upload avatar to HeyGen without requiring a saved workflow node (Generate more draft). */
  uploadAvatarDraft(file: Express.Multer.File | undefined) {
    return this.createAvatarFromUpload(file, `draft-${Date.now()}`);
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

  listAvatarLooks() {
    return this.heygen.listAvatarLooks();
  }

  deleteAvatarLook(lookId: string) {
    return this.heygen.deleteAvatarLook(lookId);
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
