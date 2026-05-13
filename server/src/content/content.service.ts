import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import type { TenancyAuth } from '../auth/tenancy.types';
import { NodeExecutor } from '../orchestration/node-executor.service';
import type { PreviousOutputs } from '../nodes/types/node-execution.types';
import {
  WorkflowNode,
  WorkflowNodeType,
  NodeAspectRatio,
  NodeMediaSourceType,
  NodeSummaryLength,
  type WorkflowNodeConfig,
  type WorkflowNodeDocument,
} from '../nodes/schemas/workflow-node.schema';
import { Pipeline } from '../pipeline/schemas/pipeline.schema';
import type { PipelineDocument } from '../pipeline/schemas/pipeline.schema';
import { Rule, type RuleDocument } from '../rule/schemas/rule.schema';
import { UploadService } from '../upload/upload.service';
import { mergeResolvedOutputs } from './content-output.utils';
import { ContentRepository } from './content.repository';
import type {
  ContentPageItemDto,
  ContentPageQueryDto,
} from './dto/content-page-query.dto';
import type { GenerateNodeDto } from './dto/generate-node.dto';
import type { RerunNodeDto } from './dto/rerun-node.dto';
import type { SaveContentDto } from './dto/save-content.dto';
import {
  ContentStatus,
  type ContentDocument,
  type ContentOutputs,
  type ContentUserEdits,
} from './schemas/content.schema';

export type ContentDetailResponse = {
  contentId: string;
  pipelineRef: string;
  workflowRef: string;
  ruleRef: string;
  status: ContentStatus;
  outputs: ReturnType<typeof mergeResolvedOutputs>;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly contentRepository: ContentRepository,
    @Inject(forwardRef(() => UploadService))
    private readonly uploadService: UploadService,
    private readonly nodeExecutor: NodeExecutor,
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
  ) {}

  async findPage(
    query: ContentPageQueryDto,
    auth: TenancyAuth,
  ): Promise<{
    data: ContentPageItemDto[];
    total: number;
  }> {
    const result = await this.contentRepository.findPage(query, auth);
    const refs = result.data.map((row) => row.contentId);
    const uploadMap =
      await this.uploadService.mapLatestUploadIdByContentRef(refs, auth);
    return {
      total: result.total,
      data: result.data.map((row) => ({
        ...row,
        uploadId: uploadMap.get(row.contentId),
      })),
    };
  }

  async getContentDetail(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<ContentDetailResponse> {
    const doc = await this.contentRepository.findByIdLean(contentId, auth);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    const snapshot = this.resolveEditableState(doc);
    const outputs = mergeResolvedOutputs(snapshot);

    const createdAtRaw = (doc as { createdAt?: Date }).createdAt;
    const updatedAtRaw = (doc as { updatedAt?: Date }).updatedAt;

    return {
      contentId: doc.contentId,
      pipelineRef: doc.pipelineRef,
      workflowRef: doc.workflowRef,
      ruleRef: doc.ruleRef,
      status: doc.status,
      outputs,
      createdAt: this.versionDateToIso(createdAtRaw ?? new Date()),
      updatedAt: this.versionDateToIso(updatedAtRaw ?? new Date()),
    };
  }

  async saveContent(
    contentId: string,
    dto: SaveContentDto,
    auth: TenancyAuth,
  ): Promise<{ success: boolean }> {
    const doc = await this.contentRepository.findById(contentId, auth);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    const plain = doc.toObject();
    const snapshot = this.resolveEditableState(plain);
    const nextUserEdits: ContentUserEdits = {
      ...snapshot.userEdits,
      ...dto.userEdits,
    };

    let nextOutputs: ContentOutputs = { ...snapshot.outputs };
    if (dto.newOutputs) {
      const keys: (keyof ContentOutputs)[] = [
        'text',
        'translatedText',
        'transcription',
        'summary',
        'image',
        'video',
      ];
      for (const k of keys) {
        const v = dto.newOutputs[k];
        if (typeof v === 'string' && v.trim() !== '') {
          nextOutputs = { ...nextOutputs, [k]: v };
        }
      }
    }

    const { matchedCount } = await this.contentRepository.updateEditableState(
      contentId,
      {
        outputs: nextOutputs,
        userEdits: nextUserEdits,
        nodePromptOverrides: snapshot.nodePromptOverrides,
      },
      auth,
    );
    if (matchedCount === 0) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }

    const refreshed = await this.contentRepository.findByIdLean(
      contentId,
      auth,
    );
    if (refreshed) {
      const merged = mergeResolvedOutputs(this.resolveEditableState(refreshed));
      await this.uploadService.syncResolvedOutputsForContent(
        contentId,
        auth,
        merged,
      );
    }

    return { success: true };
  }

  /**
   * Validates references synchronously (throws HTTP errors), then runs execution in the background.
   */
  async scheduleRerun(
    contentId: string,
    dto: RerunNodeDto,
    auth: TenancyAuth,
  ): Promise<void> {
    const content = await this.contentRepository.findById(contentId, auth);
    if (!content) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }

    const pipeline = await this.pipelineModel
      .findOne(
        mergeUserIdFilter({ pipelineId: content.pipelineRef }, auth),
      )
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${content.pipelineRef} not found`);
    }

    const wfNode = await this.workflowNodeModel
      .findOne(
        mergeUserIdFilter(
          { workflowRef: content.workflowRef, nodeId: dto.nodeId },
          auth,
        ),
      )
      .exec();
    if (!wfNode) {
      throw new NotFoundException(
        `Workflow node ${dto.nodeId} not found for workflow`,
      );
    }

    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId: content.ruleRef }, auth))
      .exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${content.ruleRef} not found`);
    }

    /** Resolved outputs match what the user sees (edits over AI). */
    const resolved = mergeResolvedOutputs(this.resolveEditableState(content));
    const previousOutputsFromDb: PreviousOutputs = {
      keywords: resolved.keywords,
      text: resolved.text,
      image: resolved.image,
      translatedText: resolved.translatedText,
      video: resolved.video,
      transcription: resolved.transcription,
      summary: resolved.summary,
    };
    const previousOutputs = this.mergeRerunPreviousOutputs(
      previousOutputsFromDb,
      dto.previousOutputs,
    );

    void this.runRerunExecution({
      content,
      pipeline,
      wfNode,
      rule,
      dto,
      previousOutputs,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Content node re-run execution failed (${contentId}): ${msg}`,
      );
    });
  }

  async getAvailableNodeTypes(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<WorkflowNodeType[]> {
    const content = await this.contentRepository.findById(contentId, auth);
    if (!content) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    const candidates: WorkflowNodeType[] = [
      WorkflowNodeType.VideoGeneration,
      WorkflowNodeType.Transcription,
      WorkflowNodeType.Summarization,
      WorkflowNodeType.Translation,
      WorkflowNodeType.ImageGeneration,
    ];
    // "Generate more" is also used to re-generate an existing output type.
    // (Re-run exists too, but generate-more can create a new variant with optional instructions.)
    return candidates;
  }

  async scheduleGenerateNode(
    contentId: string,
    dto: GenerateNodeDto,
    auth: TenancyAuth,
  ): Promise<{ success: true; nodeId: string }> {
    if (
      dto.type === WorkflowNodeType.TextGeneration ||
      dto.type === WorkflowNodeType.KeywordPlanner
    ) {
      throw new BadRequestException(
        'Text generation and keyword planner are not available for Generate More.',
      );
    }

    const content = await this.contentRepository.findById(contentId, auth);
    if (!content) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }

    const pipeline = await this.pipelineModel
      .findOne(
        mergeUserIdFilter({ pipelineId: content.pipelineRef }, auth),
      )
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${content.pipelineRef} not found`);
    }

    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId: content.ruleRef }, auth))
      .exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${content.ruleRef} not found`);
    }

    const resolved = mergeResolvedOutputs(this.resolveEditableState(content));

    const previousOutputsFromDb: PreviousOutputs = {
      keywords: resolved.keywords,
      text: resolved.text,
      image: resolved.image,
      translatedText: resolved.translatedText,
      video: resolved.video,
      transcription: resolved.transcription,
      summary: resolved.summary,
    };

    const nodeId = randomUUID();
    const config = this.defaultConfigForGenerateMore(dto.type, rule);

    void this.runGenerateMoreExecution({
      content,
      pipeline,
      rule,
      dto,
      nodeId,
      config,
      previousOutputs: previousOutputsFromDb,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Content generate-more execution failed (${contentId}): ${msg}`,
      );
    });

    return { success: true, nodeId };
  }

  private typeOutputSlotFilled(
    type: WorkflowNodeType,
    resolved: ReturnType<typeof mergeResolvedOutputs>,
  ): boolean {
    const v = (s: string | undefined) => Boolean(s?.trim());
    switch (type) {
      case WorkflowNodeType.ImageGeneration:
        return v(resolved.image);
      case WorkflowNodeType.VideoGeneration:
        return v(resolved.video);
      case WorkflowNodeType.Translation:
        return v(resolved.translatedText);
      case WorkflowNodeType.Transcription:
        return v(resolved.transcription);
      case WorkflowNodeType.Summarization:
        return v(resolved.summary);
      case WorkflowNodeType.TextGeneration:
        return v(resolved.text);
      case WorkflowNodeType.KeywordPlanner:
        return v(resolved.keywords);
      default:
        return false;
    }
  }

  private defaultConfigForGenerateMore(
    type: WorkflowNodeType,
    rule: RuleDocument,
  ): WorkflowNodeConfig {
    const channels = rule.channels ?? [];
    const hasInstagram = channels.some(
      (c) => (c.channel ?? '').toLowerCase() === 'instagram',
    );
    const audienceLang = rule.audience?.language?.trim();

    switch (type) {
      case WorkflowNodeType.VideoGeneration:
        return {
          model: 'sora-2',
          duration: 15,
          resolution: '1080p',
          aspectRatio: hasInstagram
            ? NodeAspectRatio.R9x16
            : NodeAspectRatio.R16x9,
        };
      case WorkflowNodeType.Transcription:
        return {
          model: 'whisper-1',
          sourceType: NodeMediaSourceType.Audio,
          language: audienceLang && audienceLang.length > 0 ? audienceLang : 'auto',
        };
      case WorkflowNodeType.Summarization:
        return {
          model: 'gpt-4o',
          summaryLength: NodeSummaryLength.Medium,
          sourceNodeRef: 'text_generation',
        };
      case WorkflowNodeType.Translation:
        return { model: 'gpt-4o' };
      case WorkflowNodeType.ImageGeneration:
        return { model: 'gpt-image-1' };
      default:
        return { model: 'gpt-4o' };
    }
  }

  private async runGenerateMoreExecution(args: {
    content: ContentDocument;
    pipeline: PipelineDocument;
    rule: RuleDocument;
    dto: GenerateNodeDto;
    nodeId: string;
    config: WorkflowNodeConfig;
    previousOutputs: PreviousOutputs;
  }): Promise<void> {
    const {
      content,
      pipeline,
      rule,
      dto,
      nodeId,
      config,
      previousOutputs,
    } = args;
    try {
      const extra = dto.userPrompt?.trim();
      const contentPrompt = extra
        ? `${pipeline.contentPrompt}\n\n${extra}`
        : pipeline.contentPrompt;
      await this.nodeExecutor.execute({
        node: {
          nodeId,
          type: dto.type,
          order: 99,
          config,
          workflowRef: content.workflowRef,
        },
        context: {
          rule: rule.toObject(),
          contentPrompt,
          previousOutputs,
        },
        pipelineId: pipeline.pipelineId,
        totalNodes: pipeline.nodes?.length ?? 1,
        contentId: content.contentId,
        userId: pipeline.userId ?? content.userId,
        ruleId: rule.ruleId,
      });
    } catch {
      // Final failure already emitted on content room by NodeExecutor.
    }
  }

  private async runRerunExecution(args: {
    content: ContentDocument;
    pipeline: PipelineDocument;
    wfNode: WorkflowNodeDocument;
    rule: RuleDocument;
    dto: RerunNodeDto;
    previousOutputs: {
      text?: string;
      image?: string;
      translatedText?: string;
      video?: string;
      transcription?: string;
      summary?: string;
    };
  }): Promise<void> {
    const { content, pipeline, wfNode, rule, dto, previousOutputs } = args;
    const rerunBrief = dto.updatedPrompt?.trim();
    const contentPrompt = rerunBrief
      ? rerunBrief
      : pipeline.contentPrompt;
    try {
      await this.nodeExecutor.execute({
        node: {
          nodeId: wfNode.nodeId,
          type: wfNode.type,
          order: wfNode.order,
          config: wfNode.config ?? {},
          workflowRef: content.workflowRef,
        },
        context: {
          rule: rule.toObject(),
          contentPrompt,
          previousOutputs,
        },
        pipelineId: pipeline.pipelineId,
        totalNodes: pipeline.nodes?.length ?? 1,
        contentId: content.contentId,
        userId: pipeline.userId ?? content.userId,
        ruleId: rule.ruleId,
      });
    } catch {
      // Final failure already emitted on pipeline + content rooms by NodeExecutor.
    }
  }

  async approveContent(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<{ uploadId: string }> {
    const doc = await this.contentRepository.findById(contentId, auth);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    if (doc.status !== ContentStatus.Draft) {
      throw new BadRequestException('Only draft content can be approved');
    }

    return this.applyDraftApproval(doc, auth);
  }

  /**
   * Publishing requires approved content. Call before Zernio publish: no-op if already
   * approved; promotes draft → approved and refreshes the linked upload snapshot.
   */
  async autoApproveIfDraftForPublish(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<void> {
    const doc = await this.contentRepository.findById(contentId, auth);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    if (doc.status === ContentStatus.Approved) {
      return;
    }
    if (doc.status !== ContentStatus.Draft) {
      throw new BadRequestException(
        'This content cannot be published in its current state.',
      );
    }
    await this.applyDraftApproval(doc, auth);
  }

  private async applyDraftApproval(
    doc: ContentDocument,
    auth: TenancyAuth,
  ): Promise<{ uploadId: string }> {
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId: doc.ruleRef }, auth))
      .exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${doc.ruleRef} not found`);
    }

    const resolvedOutputs = mergeResolvedOutputs(
      this.resolveEditableState(doc),
    );

    await this.contentRepository.updateStatus(
      doc.contentId,
      ContentStatus.Approved,
      auth,
    );

    return this.uploadService.refreshUploadForApprove(
      {
        userId: auth.userId,
        contentRef: doc.contentId,
        workflowRef: doc.workflowRef,
        ruleRef: doc.ruleRef,
        resolvedOutputs,
        ruleChannels: rule.channels ?? [],
      },
      auth,
    );
  }

  async ensureUploadForContent(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<{ uploadId: string }> {
    const doc = await this.contentRepository.findById(contentId, auth);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    try {
      return await this.uploadService.findUploadIdByContentRef(contentId, auth);
    } catch {
      const rule = await this.ruleModel
        .findOne(mergeUserIdFilter({ ruleId: doc.ruleRef }, auth))
        .exec();
      if (!rule) {
        throw new NotFoundException(`Rule ${doc.ruleRef} not found`);
      }
      const resolvedOutputs = mergeResolvedOutputs(
        this.resolveEditableState(doc),
      );
      return this.uploadService.createUpload({
        userId: auth.userId,
        contentRef: doc.contentId,
        workflowRef: doc.workflowRef,
        ruleRef: doc.ruleRef,
        resolvedOutputs,
        ruleChannels: rule.channels ?? [],
      });
    }
  }

  async rejectContent(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<{ success: boolean }> {
    const doc = await this.contentRepository.findById(contentId, auth);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    await this.contentRepository.updateStatus(
      contentId,
      ContentStatus.Rejected,
      auth,
    );
    return { success: true };
  }

  private versionDateToIso(d: Date | string | undefined): string {
    if (!d) return new Date().toISOString();
    return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
  }

  private mergeRerunPreviousOutputs(
    fallback: PreviousOutputs,
    incoming?: PreviousOutputs,
  ): PreviousOutputs {
    const merged: PreviousOutputs = { ...fallback };
    const keys: Array<keyof PreviousOutputs> = [
      'keywords',
      'text',
      'image',
      'translatedText',
      'video',
      'transcription',
      'summary',
    ];
    for (const key of keys) {
      const normalized = this.trimToUndefined(incoming?.[key]);
      if (normalized !== undefined) {
        merged[key] = normalized;
      }
    }
    return merged;
  }

  private trimToUndefined(value: string | undefined): string | undefined {
    if (value == null) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private resolveEditableState(content: {
    outputs?: ContentOutputs;
    userEdits?: ContentUserEdits;
    nodePromptOverrides?: Record<string, string>;
    versions?: Array<{
      versionNumber: number;
      outputs?: ContentOutputs;
      userEdits?: ContentUserEdits;
      nodePromptOverrides?: Record<string, string>;
      createdAt?: Date | string;
    }>;
    currentVersion?: number;
  }): {
    outputs: ContentOutputs;
    userEdits: ContentUserEdits;
    nodePromptOverrides: Record<string, string>;
  } {
    if (content.outputs || content.userEdits || content.nodePromptOverrides) {
      return {
        outputs: content.outputs ?? {},
        userEdits: content.userEdits ?? {},
        nodePromptOverrides: content.nodePromptOverrides ?? {},
      };
    }

    const versions = content.versions ?? [];
    const preferred =
      versions.find((v) => v.versionNumber === content.currentVersion) ??
      versions.at(-1);
    return {
      outputs: preferred?.outputs ?? {},
      userEdits: preferred?.userEdits ?? {},
      nodePromptOverrides: preferred?.nodePromptOverrides ?? {},
    };
  }
}
