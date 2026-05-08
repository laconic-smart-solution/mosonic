import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NodeExecutor } from '../orchestration/node-executor.service';
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
import type { RestoreVersionDto } from './dto/restore-version.dto';
import type { SaveContentDto } from './dto/save-content.dto';
import {
  ContentStatus,
  type ContentDocument,
  type ContentVersionEntry,
} from './schemas/content.schema';

export type ContentDetailResponse = {
  contentId: string;
  pipelineRef: string;
  workflowRef: string;
  ruleRef: string;
  status: ContentStatus;
  currentVersion: number;
  outputs: ReturnType<typeof mergeResolvedOutputs>;
  versions: Array<{
    versionNumber: number;
    outputs?: Record<string, unknown>;
    userEdits?: Record<string, unknown>;
    nodePromptOverrides?: Record<string, string>;
    createdAt: string;
  }>;
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
    const normalized = this.normalizeVersionsForTwoSlotModel(
      doc.versions ?? [],
      doc.currentVersion,
    );
    const versions = normalized.versions;
    if (versions.length === 0) {
      throw new BadRequestException('Content has no versions');
    }
    const current = versions.find(
      (v) => v.versionNumber === normalized.currentVersion,
    );
    if (!current) {
      throw new BadRequestException('Current version row is missing');
    }
    const outputs = mergeResolvedOutputs(current);

    const createdAtRaw = (doc as { createdAt?: Date }).createdAt;
    const updatedAtRaw = (doc as { updatedAt?: Date }).updatedAt;

    return {
      contentId: doc.contentId,
      pipelineRef: doc.pipelineRef,
      workflowRef: doc.workflowRef,
      ruleRef: doc.ruleRef,
      status: doc.status as ContentStatus,
      currentVersion: normalized.currentVersion,
      outputs,
      versions: versions.map((v) => ({
        versionNumber: v.versionNumber,
        outputs: v.outputs as Record<string, unknown>,
        userEdits: v.userEdits as Record<string, unknown>,
        nodePromptOverrides: v.nodePromptOverrides,
        createdAt: this.versionDateToIso(v.createdAt),
      })),
      createdAt: this.versionDateToIso(createdAtRaw ?? new Date()),
      updatedAt: this.versionDateToIso(updatedAtRaw ?? new Date()),
    };
  }

  async saveContent(
    contentId: string,
    dto: SaveContentDto,
  ): Promise<{ versionNumber: number }> {
    const doc = await this.contentRepository.findById(contentId);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    const normalized = this.normalizeVersionsForTwoSlotModel(
      doc.versions ?? [],
      doc.currentVersion,
    );
    const current = normalized.versions.find(
      (v) => v.versionNumber === normalized.currentVersion,
    );
    if (!current) {
      throw new BadRequestException('Current version row is missing');
    }

    const ue = dto.userEdits;
    const resolvedCurrent = mergeResolvedOutputs(current);
    const previousVersion: ContentVersionEntry = {
      versionNumber: 1,
      outputs: {
        text: resolvedCurrent.text,
        image: resolvedCurrent.image,
        translatedText: resolvedCurrent.translatedText,
        video: resolvedCurrent.video,
        transcription: resolvedCurrent.transcription,
        summary: resolvedCurrent.summary,
      },
      userEdits: {},
      nodePromptOverrides: { ...(current.nodePromptOverrides ?? {}) },
      createdAt: this.ensureDate(current.createdAt),
    };
    const nextCurrentVersion: ContentVersionEntry = {
      versionNumber: 2,
      outputs: { ...previousVersion.outputs },
      userEdits: {
        ...(ue.text !== undefined ? { text: ue.text } : {}),
        ...(ue.translatedText !== undefined
          ? { translatedText: ue.translatedText }
          : {}),
        ...(ue.transcription !== undefined
          ? { transcription: ue.transcription }
          : {}),
        ...(ue.summary !== undefined ? { summary: ue.summary } : {}),
        ...(ue.image !== undefined ? { image: ue.image } : {}),
        ...(ue.video !== undefined ? { video: ue.video } : {}),
      },
      nodePromptOverrides: { ...(current.nodePromptOverrides ?? {}) },
      createdAt: new Date(),
    };

    await this.contentRepository.replaceVersionsAndSetCurrent(
      contentId,
      [previousVersion, nextCurrentVersion],
      2,
    );
    return { versionNumber: 2 };
  }

  /**
   * Validates references synchronously (throws HTTP errors), then runs execution in the background.
   */
  async scheduleRerun(contentId: string, dto: RerunNodeDto): Promise<void> {
    const content = await this.contentRepository.findById(contentId);
    if (!content) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }

    const normalized = this.normalizeVersionsForTwoSlotModel(
      content.versions ?? [],
      content.currentVersion,
    );
    const current = normalized.versions.find(
      (v) => v.versionNumber === normalized.currentVersion,
    );
    if (!current) {
      throw new BadRequestException('Current version row is missing');
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

    const rule = await this.ruleModel.findOne({ ruleId: content.ruleRef }).exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${content.ruleRef} not found`);
    }

    /** Resolved outputs match what the user sees (edits over AI). */
    const resolved = mergeResolvedOutputs(current);
    const previousOutputs = {
      text: resolved.text,
      image: resolved.image,
      translatedText: resolved.translatedText,
      video: resolved.video,
      transcription: resolved.transcription,
      summary: resolved.summary,
    };

    void this.runRerunExecution({
      content,
      pipeline,
      wfNode,
      rule,
      dto,
      previousOutputs,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Content node re-run execution failed (${contentId}): ${msg}`);
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
          rule: rule.toObject() as Rule,
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

    const normalized = this.normalizeVersionsForTwoSlotModel(
      doc.versions ?? [],
      doc.currentVersion,
    );
    const current = normalized.versions.find(
      (v) => v.versionNumber === normalized.currentVersion,
    );
    if (!current) {
      throw new BadRequestException('Current version row is missing');
    }

    const rule = await this.ruleModel.findOne({ ruleId: doc.ruleRef }).exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${doc.ruleRef} not found`);
    }

    const resolvedOutputs = mergeResolvedOutputs(current);

    await this.contentRepository.updateStatus(contentId, ContentStatus.Approved);

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
    await this.contentRepository.updateStatus(contentId, ContentStatus.Rejected);
    return { success: true };
  }

  async getVersionSummaries(contentId: string): Promise<
    Array<{ versionNumber: number; createdAt: string }>
  > {
    const doc = await this.contentRepository.findById(contentId);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    const normalized = this.normalizeVersionsForTwoSlotModel(
      doc.versions ?? [],
      doc.currentVersion,
    );
    return normalized.versions.map((v) => ({
      versionNumber: v.versionNumber,
      createdAt: this.versionDateToIso(v.createdAt),
    }));
  }

  async restoreVersion(
    contentId: string,
    dto: RestoreVersionDto,
  ): Promise<{ success: boolean }> {
    const doc = await this.contentRepository.findById(contentId);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    const normalized = this.normalizeVersionsForTwoSlotModel(
      doc.versions ?? [],
      doc.currentVersion,
    );
    const exists = normalized.versions.some(
      (v) => v.versionNumber === dto.versionNumber,
    );
    if (!exists) {
      throw new BadRequestException('Version not found');
    }
    await this.contentRepository.replaceVersionsAndSetCurrent(
      contentId,
      normalized.versions,
      dto.versionNumber,
    );
    if (doc.status === ContentStatus.Rejected) {
      await this.contentRepository.updateStatus(contentId, ContentStatus.Draft);
    }
    return { success: true };
  }

  private versionDateToIso(d: Date | string | undefined): string {
    if (!d) return new Date().toISOString();
    return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
  }

  private ensureDate(input: Date | string | undefined): Date {
    if (!input) return new Date();
    return input instanceof Date ? input : new Date(input);
  }

  private normalizeVersionsForTwoSlotModel(
    versions: ContentVersionEntry[],
    currentVersion: number,
  ): { versions: ContentVersionEntry[]; currentVersion: number } {
    if (versions.length === 0) {
      return { versions: [], currentVersion: 1 };
    }

    const sorted = [...versions].sort(
      (a, b) => this.ensureDate(a.createdAt).getTime() - this.ensureDate(b.createdAt).getTime(),
    );
    const currentCandidates = sorted.filter((v) => v.versionNumber === currentVersion);
    const currentRaw = currentCandidates.at(-1) ?? sorted.at(-1);
    if (!currentRaw) {
      return { versions: [], currentVersion: 1 };
    }

    const previousRaw = [...sorted]
      .reverse()
      .find((v) => this.ensureDate(v.createdAt).getTime() < this.ensureDate(currentRaw.createdAt).getTime());

    if (!previousRaw) {
      return {
        versions: [{ ...currentRaw, versionNumber: 1 }],
        currentVersion: 1,
      };
    }

    return {
      versions: [
        { ...previousRaw, versionNumber: 1 },
        { ...currentRaw, versionNumber: 2 },
      ],
      currentVersion: 2,
    };
  }
}
