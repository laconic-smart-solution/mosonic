import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NodeExecutor } from '../orchestration/node-executor.service';
import type { PreviousOutputs } from '../nodes/types/node-execution.types';
import {
  WorkflowNode,
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
    private readonly uploadService: UploadService,
    private readonly nodeExecutor: NodeExecutor,
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
  ) {}

  async findPage(query: ContentPageQueryDto): Promise<{
    data: ContentPageItemDto[];
    total: number;
  }> {
    return this.contentRepository.findPage(query);
  }

  async getContentDetail(contentId: string): Promise<ContentDetailResponse> {
    const doc = await this.contentRepository.findByIdLean(contentId);
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
  ): Promise<{ success: boolean }> {
    const doc = await this.contentRepository.findById(contentId);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    const snapshot = this.resolveEditableState(doc);
    const nextUserEdits: ContentUserEdits = {
      ...snapshot.userEdits,
      ...dto.userEdits,
    };

    await this.contentRepository.updateEditableState(contentId, {
      outputs: snapshot.outputs,
      userEdits: nextUserEdits,
      nodePromptOverrides: snapshot.nodePromptOverrides,
    });
    return { success: true };
  }

  /**
   * Validates references synchronously (throws HTTP errors), then runs execution in the background.
   */
  async scheduleRerun(contentId: string, dto: RerunNodeDto): Promise<void> {
    const content = await this.contentRepository.findById(contentId);
    if (!content) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }

    const pipeline = await this.pipelineModel
      .findOne({ pipelineId: content.pipelineRef })
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${content.pipelineRef} not found`);
    }

    const wfNode = await this.workflowNodeModel
      .findOne({
        workflowRef: content.workflowRef,
        nodeId: dto.nodeId,
      })
      .exec();
    if (!wfNode) {
      throw new NotFoundException(
        `Workflow node ${dto.nodeId} not found for workflow`,
      );
    }

    const rule = await this.ruleModel
      .findOne({ ruleId: content.ruleRef })
      .exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${content.ruleRef} not found`);
    }

    /** Resolved outputs match what the user sees (edits over AI). */
    const resolved = mergeResolvedOutputs(this.resolveEditableState(content));
    const previousOutputsFromDb: PreviousOutputs = {
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
    try {
      await this.nodeExecutor.execute({
        node: {
          nodeId: wfNode.nodeId,
          type: wfNode.type,
          order: wfNode.order,
          userPrompt: dto.updatedPrompt ?? wfNode.userPrompt,
          config: wfNode.config ?? {},
          workflowRef: content.workflowRef,
        },
        context: {
          rule: rule.toObject(),
          contentPrompt: pipeline.contentPrompt,
          previousOutputs,
        },
        pipelineId: pipeline.pipelineId,
        totalNodes: pipeline.nodes?.length ?? 1,
        contentId: content.contentId,
      });
    } catch {
      // Final failure already emitted on pipeline + content rooms by NodeExecutor.
    }
  }

  async approveContent(contentId: string): Promise<{ uploadId: string }> {
    const doc = await this.contentRepository.findById(contentId);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    if (doc.status !== ContentStatus.Draft) {
      throw new BadRequestException('Only draft content can be approved');
    }

    const rule = await this.ruleModel.findOne({ ruleId: doc.ruleRef }).exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${doc.ruleRef} not found`);
    }

    const resolvedOutputs = mergeResolvedOutputs(
      this.resolveEditableState(doc),
    );

    await this.contentRepository.updateStatus(
      contentId,
      ContentStatus.Approved,
    );

    const { uploadId } = await this.uploadService.createUpload({
      contentRef: doc.contentId,
      workflowRef: doc.workflowRef,
      ruleRef: doc.ruleRef,
      resolvedOutputs,
      ruleChannels: rule.channels ?? [],
    });

    return { uploadId };
  }

  async rejectContent(contentId: string): Promise<{ success: boolean }> {
    const doc = await this.contentRepository.findById(contentId);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    await this.contentRepository.updateStatus(
      contentId,
      ContentStatus.Rejected,
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
