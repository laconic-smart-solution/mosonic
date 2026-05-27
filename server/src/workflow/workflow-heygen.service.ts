import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { HeygenAssetsService } from '../nodes/services/heygen-assets.service';
import {
  WorkflowNode,
  WorkflowNodeType,
  type WorkflowNodeDocument,
} from '../nodes/schemas/workflow-node.schema';
import { parseWorkflowNodeConfigOrThrow } from '../nodes/workflow-node-config.zod';
import { Workflow, type WorkflowDocument } from './schemas/workflow.schema';

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class WorkflowHeygenService {
  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
    private readonly heygen: HeygenAssetsService,
  ) {}

  private async getVideoNode(
    workflowId: string,
    nodeId: string,
    auth: TenancyAuth,
  ): Promise<WorkflowNodeDocument> {
    const workflow = await this.workflowModel
      .findOne(mergeUserIdFilter({ workflowId }, auth))
      .exec();
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }
    const node = await this.workflowNodeModel
      .findOne(
        mergeUserIdFilter(
          { workflowRef: workflowId, nodeId, type: WorkflowNodeType.VideoGeneration },
          auth,
        ),
      )
      .exec();
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
    const uploadFile = this.assertImageFile(file);
    const node = await this.getVideoNode(workflowId, nodeId, auth);

    const { assetId, url } = await this.heygen.uploadAsset(
      uploadFile.buffer,
      uploadFile.mimetype,
      uploadFile.originalname || 'avatar.jpg',
    );

    const { avatarId } = await this.heygen.createPhotoAvatar({
      name: `workflow-${workflowId}-${nodeId}`,
      assetId,
    });

    const merged = {
      ...(node.config ?? {}),
      mode: 'presenter',
      heygenAvatarId: avatarId,
      heygenAvatarAssetId: assetId,
      heygenAvatarPhotoUrl: url,
    };
    const config = parseWorkflowNodeConfigOrThrow(
      WorkflowNodeType.VideoGeneration,
      merged,
    );

    await this.workflowNodeModel
      .updateOne(
        mergeUserIdFilter({ workflowRef: workflowId, nodeId }, auth),
        { $set: { config } },
      )
      .exec();

    return {
      heygenAvatarId: avatarId,
      heygenAvatarAssetId: assetId,
      previewUrl: url,
    };
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

    const merged = {
      ...(node.config ?? {}),
      heygenBackgroundAssetId: assetId,
      heygenBackgroundUrl: url,
      removeBackground: true,
    };
    const config = parseWorkflowNodeConfigOrThrow(
      WorkflowNodeType.VideoGeneration,
      merged,
    );

    await this.workflowNodeModel
      .updateOne(
        mergeUserIdFilter({ workflowRef: workflowId, nodeId }, auth),
        { $set: { config } },
      )
      .exec();

    return {
      heygenBackgroundAssetId: assetId,
      previewUrl: url,
    };
  }

  listVoices(query?: { language?: string; gender?: string }) {
    return this.heygen.listVoices(query);
  }

  /** Merge presenter / video config into the saved workflow node (e.g. voice selection). */
  async patchVideoNodeConfig(
    workflowId: string,
    nodeId: string,
    patch: Record<string, unknown>,
    auth: TenancyAuth,
  ): Promise<Record<string, unknown>> {
    const node = await this.getVideoNode(workflowId, nodeId, auth);
    const merged = {
      ...(node.config ?? {}),
      ...patch,
    };
    const config = parseWorkflowNodeConfigOrThrow(
      WorkflowNodeType.VideoGeneration,
      merged,
    );
    await this.workflowNodeModel
      .updateOne(
        mergeUserIdFilter({ workflowRef: workflowId, nodeId }, auth),
        { $set: { config } },
      )
      .exec();
    return config as unknown as Record<string, unknown>;
  }
}
