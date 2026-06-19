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
import { CreditCalculationService } from '../credit/credit-calculation.service';
import { InsufficientCreditsException } from '../credit/insufficient-credits.exception';
import { CreditService } from '../credit/credit.service';
import { NodeCreditPriceService } from '../credit/node-credit-price.service';
import { NodeExecutor } from '../orchestration/node-executor.service';
import type { PreviousOutputs } from '../nodes/types/node-execution.types';
import {
  WorkflowNode,
  WorkflowNodeType,
  type WorkflowNodeConfig,
  type WorkflowNodeDocument,
} from '../nodes/schemas/workflow-node.schema';
import { Pipeline } from '../pipeline/schemas/pipeline.schema';
import type { PipelineDocument } from '../pipeline/schemas/pipeline.schema';
import { Rule, type RuleDocument } from '../rule/schemas/rule.schema';
import { UserPlan, type UserPlanDocument } from '../plan/schemas/user-plan.schema';
import { EventsService } from '../events/events.service';
import { UploadService } from '../upload/upload.service';
import {
  allRequiredStepsApproved,
  appendApprovalRecord,
  buildApprovalStateFromPolicy,
  nextPendingStepIndex,
} from './content-approval.util';
import { WorkflowService } from '../workflow/workflow.service';
import {
  defaultWorkflowNodeConfigForRule,
  parseWorkflowNodeConfigOrThrow,
} from '../nodes/workflow-node-config.zod';
import { mergeResolvedOutputs } from './content-output.utils';
import { flattenNodeOutputsToAiOutputs } from './content-node-output.util';
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
  type ContentApprovalState,
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
  nodeOutputs: Record<string, Record<string, unknown>>;
  nodeUserEdits: Record<string, Record<string, unknown>>;
  approval?: ContentApprovalState;
  variantId?: string | null;
  experimentId?: string | null;
  createdAt: string;
  updatedAt: string;
  newsMeta?: {
    title: string;
    url: string;
    sourceId: string;
    publishedAt: string;
    relevanceScore: number;
    suggestedAngle: string;
  } | null;
};

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly events: EventsService,
    @Inject(forwardRef(() => UploadService))
    private readonly uploadService: UploadService,
    private readonly workflowService: WorkflowService,
    private readonly nodeExecutor: NodeExecutor,
    private readonly creditService: CreditService,
    private readonly nodeCreditPriceService: NodeCreditPriceService,
    private readonly creditCalculation: CreditCalculationService,
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
    @InjectModel(UserPlan.name)
    private readonly userPlanModel: Model<UserPlanDocument>,
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

  async getContentStats(auth: TenancyAuth): Promise<{
    total: number;
    byStatus: Partial<Record<ContentStatus, number>>;
  }> {
    return this.contentRepository.getStats(auth);
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
    const workflowNodesOrdered = await this.loadWorkflowNodesOrdered(
      doc.workflowRef,
      auth,
    );
    const pipeline = await this.pipelineModel
      .findOne(
        mergeUserIdFilter({ pipelineId: doc.pipelineRef }, auth),
        { metadata: 1, 'nodes.nodeId': 1, 'nodes.type': 1, 'nodes.order': 1 },
      )
      .lean()
      .exec();
    const pipelineNodesOrdered = this.pipelineNodesForMerge(pipeline);
    const outputs = mergeResolvedOutputs(snapshot, {
      ...(pipelineNodesOrdered.length > 0
        ? { pipelineNodesOrdered }
        : { workflowNodesOrdered }),
    });

    const createdAtRaw = (doc as { createdAt?: Date }).createdAt;
    const updatedAtRaw = (doc as { updatedAt?: Date }).updatedAt;

    const newsMeta =
      pipeline?.metadata?.source === 'news' && pipeline.metadata.newsMeta
        ? {
            title: pipeline.metadata.newsMeta.title,
            url: pipeline.metadata.newsMeta.url,
            sourceId: pipeline.metadata.newsMeta.sourceId,
            publishedAt: pipeline.metadata.newsMeta.publishedAt,
            relevanceScore: pipeline.metadata.newsMeta.relevanceScore,
            suggestedAngle: pipeline.metadata.newsMeta.suggestedAngle ?? '',
          }
        : null;

    return {
      contentId: doc.contentId,
      pipelineRef: doc.pipelineRef,
      workflowRef: doc.workflowRef,
      ruleRef: doc.ruleRef,
      status: doc.status,
      outputs,
      nodeOutputs: snapshot.nodeOutputs ?? {},
      nodeUserEdits: snapshot.nodeUserEdits ?? {},
      approval: doc.approval ?? { steps: [], currentStepIndex: 0, records: [] },
      variantId: doc.variantId ?? null,
      experimentId: doc.experimentId ?? null,
      newsMeta,
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
    const nextNodeUserEdits: Record<string, Record<string, unknown>> = {
      ...snapshot.nodeUserEdits,
      ...(dto.nodeUserEdits ?? {}),
    };

    const workflowNodesOrdered = await this.loadWorkflowNodesOrdered(
      plain.workflowRef,
      auth,
    );

    let nextOutputs: ContentOutputs = {
      ...snapshot.outputs,
      ...flattenNodeOutputsToAiOutputs(
        workflowNodesOrdered,
        snapshot.nodeOutputs ?? {},
        nextNodeUserEdits,
      ),
    };
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
        nodeOutputs: snapshot.nodeOutputs,
        nodeUserEdits: nextNodeUserEdits,
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
      const workflowNodesOrdered = await this.loadWorkflowNodesOrdered(
        refreshed.workflowRef,
        auth,
      );
      const merged = mergeResolvedOutputs(
        this.resolveEditableState(refreshed),
        { workflowNodesOrdered },
      );
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

    const workflowNodesOrdered = await this.loadWorkflowNodesOrdered(
      content.workflowRef,
      auth,
    );
    /** Resolved outputs match what the user sees (edits over AI). */
    const resolved = mergeResolvedOutputs(
      this.resolveEditableState(content.toObject()),
      { workflowNodesOrdered },
    );
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

    let nodeForRun = wfNode;
    if (dto.updatedConfig && Object.keys(dto.updatedConfig).length > 0) {
      const mergedConfig = parseWorkflowNodeConfigOrThrow(wfNode.type, {
        ...(wfNode.config ?? {}),
        ...dto.updatedConfig,
      });
      await this.workflowNodeModel
        .updateOne(
          mergeUserIdFilter(
            { workflowRef: content.workflowRef, nodeId: dto.nodeId },
            auth,
          ),
          { $set: { config: mergedConfig } },
        )
        .exec();
      nodeForRun = wfNode;
      nodeForRun.config = mergedConfig;
    }

    const creditsCharged = await this.chargeForContentNode({
      userId: auth.userId,
      contentId: content.contentId,
      pipelineId: pipeline.pipelineId,
      nodeId: dto.nodeId,
      nodeType: nodeForRun.type,
    });

    void this.runRerunExecution({
      content,
      pipeline,
      wfNode: nodeForRun,
      rule,
      dto,
      previousOutputs,
      auth,
      creditsCharged,
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

    const workflowNodesOrdered = await this.loadWorkflowNodesOrdered(
      content.workflowRef,
      auth,
    );
    const resolved = mergeResolvedOutputs(
      this.resolveEditableState(content.toObject()),
      { workflowNodesOrdered },
    );

    const previousOutputsFromDb: PreviousOutputs = {
      keywords: resolved.keywords,
      text: resolved.text,
      image: resolved.image,
      translatedText: resolved.translatedText,
      video: resolved.video,
      transcription: resolved.transcription,
      summary: resolved.summary,
    };

    const nodeId = dto.nodeId?.trim() || randomUUID();
    const baseConfig = defaultWorkflowNodeConfigForRule(dto.type, rule);
    let config: WorkflowNodeConfig;
    try {
      config = parseWorkflowNodeConfigOrThrow(dto.type, {
        ...baseConfig,
        ...(dto.config ?? {}),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Invalid node config: ${msg}`);
    }

    const { order } = await this.workflowService.appendWorkflowNode(
      content.workflowRef,
      {
        nodeId,
        type: dto.type,
        config,
        userPrompt: dto.userPrompt,
      },
      auth,
    );

    const creditsCharged = await this.chargeForContentNode({
      userId: auth.userId,
      contentId: content.contentId,
      pipelineId: pipeline.pipelineId,
      nodeId,
      nodeType: dto.type,
    });

    void this.runGenerateMoreExecution({
      content,
      pipeline,
      rule,
      dto,
      nodeId,
      order,
      config,
      previousOutputs: previousOutputsFromDb,
      auth,
      creditsCharged,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Content generate-more execution failed (${contentId}): ${msg}`,
      );
    });

    return { success: true, nodeId };
  }

  private async getCreditsRemaining(userId: string): Promise<number> {
    const userPlan = await this.userPlanModel
      .findOne({ userId, status: 'active' })
      .lean<{ creditsRemaining?: number }>()
      .exec();
    return userPlan?.creditsRemaining ?? 0;
  }

  private async chargeForContentNode(args: {
    userId: string;
    contentId: string;
    pipelineId: string;
    nodeId: string;
    nodeType: string;
  }): Promise<number> {
    const creditsEach =
      (await this.nodeCreditPriceService.getActiveCostCredit(args.nodeType)) ??
      0;
    if (creditsEach <= 0) return 0;

    const creditsRemaining = await this.getCreditsRemaining(args.userId);
    if (creditsRemaining < creditsEach) {
      throw new InsufficientCreditsException({
        requiredCredits: creditsEach,
        creditsRemaining,
      });
    }

    const config = await this.creditCalculation.getConfig();
    await this.creditService.chargeSingleNodeRun({
      userId: args.userId,
      pipelineRef: args.pipelineId,
      contentRef: args.contentId,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      credits: creditsEach,
      creditPriceUsd: config.creditPriceUsd,
    });
    return creditsEach;
  }

  private async refundContentNodeCharge(args: {
    userId: string;
    contentId: string;
    pipelineId: string;
    nodeId: string;
    nodeType: string;
    credits: number;
  }): Promise<void> {
    if (args.credits <= 0) return;
    const config = await this.creditCalculation.getConfig();
    await this.creditService.refundSingleNodeRun({
      userId: args.userId,
      pipelineRef: args.pipelineId,
      contentRef: args.contentId,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      credits: args.credits,
      creditPriceUsd: config.creditPriceUsd,
    });
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

  private async runGenerateMoreExecution(args: {
    content: ContentDocument;
    pipeline: PipelineDocument;
    rule: RuleDocument;
    dto: GenerateNodeDto;
    nodeId: string;
    order: number;
    config: WorkflowNodeConfig;
    previousOutputs: PreviousOutputs;
    auth: TenancyAuth;
    creditsCharged: number;
  }): Promise<void> {
    const {
      content,
      pipeline,
      rule,
      dto,
      nodeId,
      order,
      config,
      previousOutputs,
      auth,
      creditsCharged,
    } = args;
    const userId = auth.userId;
    try {
      const contentPrompt = pipeline.contentPrompt;
      const totalNodes = await this.workflowNodeModel.countDocuments(
        mergeUserIdFilter({ workflowRef: content.workflowRef }, auth),
      );
      const result = await this.nodeExecutor.execute({
        node: {
          nodeId,
          type: dto.type,
          order,
          config,
          workflowRef: content.workflowRef,
        },
        context: {
          rule: rule.toObject(),
          contentPrompt,
          previousOutputs,
        },
        pipelineId: pipeline.pipelineId,
        totalNodes: Math.max(totalNodes, 1),
        contentId: content.contentId,
        userId: pipeline.userId ?? content.userId,
        ruleId: rule.ruleId,
      });
      await this.persistNodeCompletion(
        content.contentId,
        content.workflowRef,
        nodeId,
        result.output as Record<string, unknown>,
        auth,
      );
    } catch {
      await this.refundContentNodeCharge({
        userId,
        contentId: content.contentId,
        pipelineId: pipeline.pipelineId,
        nodeId,
        nodeType: dto.type,
        credits: creditsCharged,
      }).catch((refundErr: unknown) => {
        const msg =
          refundErr instanceof Error ? refundErr.message : String(refundErr);
        this.logger.warn(
          `Content generate-more credit refund failed (${content.contentId}): ${msg}`,
        );
      });
    }
  }

  private async runRerunExecution(args: {
    content: ContentDocument;
    pipeline: PipelineDocument;
    wfNode: WorkflowNodeDocument;
    rule: RuleDocument;
    dto: RerunNodeDto;
    previousOutputs: PreviousOutputs;
    auth: TenancyAuth;
    creditsCharged: number;
  }): Promise<void> {
    const { content, pipeline, wfNode, rule, previousOutputs, auth, creditsCharged } =
      args;
    const userId = auth.userId;
    const contentPrompt = pipeline.contentPrompt;
    try {
      const totalNodes = await this.workflowNodeModel.countDocuments(
        mergeUserIdFilter({ workflowRef: content.workflowRef }, auth),
      );
      const result = await this.nodeExecutor.execute({
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
        totalNodes: Math.max(totalNodes, 1),
        contentId: content.contentId,
        userId: pipeline.userId ?? content.userId,
        ruleId: rule.ruleId,
      });
      await this.persistNodeCompletion(
        content.contentId,
        content.workflowRef,
        wfNode.nodeId,
        result.output as Record<string, unknown>,
        auth,
      );
    } catch {
      await this.refundContentNodeCharge({
        userId,
        contentId: content.contentId,
        pipelineId: pipeline.pipelineId,
        nodeId: wfNode.nodeId,
        nodeType: wfNode.type,
        credits: creditsCharged,
      }).catch((refundErr: unknown) => {
        const msg =
          refundErr instanceof Error ? refundErr.message : String(refundErr);
        this.logger.warn(
          `Content rerun credit refund failed (${content.contentId}): ${msg}`,
        );
      });
    }
  }

  async getContentForAutonomy(contentId: string, auth: TenancyAuth) {
    const doc = await this.contentRepository.findById(contentId, auth);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    return doc.toObject();
  }

  async approveContent(
    contentId: string,
    auth: TenancyAuth,
    comment?: string,
  ): Promise<{ uploadId: string }> {
    const doc = await this.contentRepository.findById(contentId, auth);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    if (
      doc.status !== ContentStatus.Draft &&
      doc.status !== ContentStatus.InReview
    ) {
      throw new BadRequestException(
        'Only draft or in-review content can be approved',
      );
    }

    const steps = doc.approval?.steps ?? [];
    if (steps.length === 0) {
      return this.applyDraftApproval(doc, auth);
    }

    const pendingIndex = nextPendingStepIndex(doc.approval);
    if (pendingIndex === null) {
      return this.applyDraftApproval(doc, auth);
    }
    const nextApproval = appendApprovalRecord(doc.approval, {
      stepIndex: pendingIndex,
      userId: auth.userId,
      at: new Date(),
      comment: comment ?? null,
    });
    doc.approval = nextApproval;

    if (!allRequiredStepsApproved(doc.approval)) {
      doc.status = ContentStatus.InReview;
      await doc.save();
      this.events.emitToContent(contentId, 'content:step_approved', {
        contentId,
        stepIndex: pendingIndex,
        status: doc.status,
      });
      this.events.emitToContent(contentId, 'content:approval_required', {
        contentId,
        nextStepIndex: nextApproval.currentStepIndex,
      });
      const uploadId = await this.uploadService
        .findUploadIdByContentRef(contentId, auth)
        .catch(() => this.ensureUploadForContent(contentId, auth));
      return uploadId;
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
    if (
      doc.status !== ContentStatus.Draft &&
      doc.status !== ContentStatus.InReview
    ) {
      throw new BadRequestException(
        'This content cannot be published in its current state.',
      );
    }
    if (!allRequiredStepsApproved(doc.approval)) {
      throw new BadRequestException('Approval steps are incomplete');
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

    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId: doc.pipelineRef }, auth))
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${doc.pipelineRef} not found`);
    }

    const snapshot = this.resolveEditableState(doc.toObject());
    const pipelineNodesOrdered = this.pipelineNodesForMerge(pipeline);
    const workflowNodesOrdered = await this.loadWorkflowNodesOrdered(
      doc.workflowRef,
      auth,
    );
    const resolvedOutputs = mergeResolvedOutputs(snapshot, {
      ...(pipelineNodesOrdered.length > 0
        ? { pipelineNodesOrdered }
        : { workflowNodesOrdered }),
    });

    const channels = this.uploadService.buildChannelEntriesFromPipeline(
      rule.channels ?? [],
      pipeline,
      resolvedOutputs,
    );

    await this.contentRepository.updateStatus(
      doc.contentId,
      ContentStatus.Approved,
      auth,
    );

    this.events.emitToContent(doc.contentId, 'content:approved', {
      contentId: doc.contentId,
    });

    return this.uploadService.refreshUploadForApprove(
      {
        userId: auth.userId,
        contentRef: doc.contentId,
        workflowRef: doc.workflowRef,
        ruleRef: doc.ruleRef,
        resolvedOutputs,
        ruleChannels: rule.channels ?? [],
        channels,
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
      const pipeline = await this.pipelineModel
        .findOne(mergeUserIdFilter({ pipelineId: doc.pipelineRef }, auth))
        .exec();
      if (!pipeline) {
        throw new NotFoundException(`Pipeline ${doc.pipelineRef} not found`);
      }
      const snapshot = this.resolveEditableState(doc.toObject());
      const pipelineNodesOrdered = this.pipelineNodesForMerge(pipeline);
      const workflowNodesOrdered = await this.loadWorkflowNodesOrdered(
        doc.workflowRef,
        auth,
      );
      const resolvedOutputs = mergeResolvedOutputs(snapshot, {
        ...(pipelineNodesOrdered.length > 0
          ? { pipelineNodesOrdered }
          : { workflowNodesOrdered }),
      });
      const channels = this.uploadService.buildChannelEntriesFromPipeline(
        rule.channels ?? [],
        pipeline,
        resolvedOutputs,
      );
      return this.uploadService.createUpload({
        userId: auth.userId,
        contentRef: doc.contentId,
        workflowRef: doc.workflowRef,
        ruleRef: doc.ruleRef,
        resolvedOutputs,
        ruleChannels: rule.channels ?? [],
        channels,
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
    this.events.emitToContent(contentId, 'content:rejected', { contentId });
    return { success: true };
  }

  buildApprovalFromRule(
    rule: { approvalPolicy?: Array<{ role: string; required: boolean }> },
  ) {
    const steps = (rule.approvalPolicy ?? []).map((s) => ({
      role: s.role,
      required: s.required !== false,
    }));
    return buildApprovalStateFromPolicy(steps);
  }

  private versionDateToIso(d: Date | string | undefined): string {
    if (!d) return new Date().toISOString();
    return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
  }

  private async loadWorkflowNodesOrdered(
    workflowRef: string,
    auth: TenancyAuth,
  ): Promise<Array<{ nodeId: string; type: string }>> {
    const nodes = await this.workflowNodeModel
      .find(mergeUserIdFilter({ workflowRef }, auth))
      .sort({ order: 1 })
      .select({ nodeId: 1, type: 1 })
      .lean()
      .exec();
    return nodes.map((n) => ({
      nodeId: n.nodeId,
      type: typeof n.type === 'string' ? n.type : String(n.type ?? ''),
    }));
  }

  private pipelineNodesForMerge(
    pipeline:
      | { nodes?: Array<{ nodeId: string; type: unknown; order: number }> }
      | null
      | undefined,
  ): Array<{ nodeId: string; type: string; order: number }> {
    if (!pipeline?.nodes?.length) return [];
    return [...pipeline.nodes]
      .sort((a, b) => a.order - b.order)
      .map((n) => ({
        nodeId: n.nodeId,
        type: typeof n.type === 'string' ? n.type : String(n.type ?? ''),
        order: n.order,
      }));
  }

  private async persistNodeCompletion(
    contentId: string,
    workflowRef: string,
    nodeId: string,
    output: Record<string, unknown>,
    auth: TenancyAuth,
  ): Promise<void> {
    const doc = await this.contentRepository.findByIdLean(contentId, auth);
    if (!doc) return;
    const snapshot = this.resolveEditableState(
      doc as {
        outputs?: ContentOutputs;
        userEdits?: ContentUserEdits;
        nodePromptOverrides?: Record<string, string>;
        nodeOutputs?: Record<string, Record<string, unknown>>;
        nodeUserEdits?: Record<string, Record<string, unknown>>;
        versions?: Array<{
          versionNumber: number;
          outputs?: ContentOutputs;
          userEdits?: ContentUserEdits;
          nodePromptOverrides?: Record<string, string>;
          createdAt?: Date | string;
        }>;
        currentVersion?: number;
      },
    );
    const mergedNodeOutputs = {
      ...(snapshot.nodeOutputs ?? {}),
      [nodeId]: output,
    };
    const workflowNodesOrdered = await this.loadWorkflowNodesOrdered(
      workflowRef,
      auth,
    );
    const nextOutputs: ContentOutputs = {
      ...snapshot.outputs,
      ...flattenNodeOutputsToAiOutputs(
        workflowNodesOrdered,
        mergedNodeOutputs,
        snapshot.nodeUserEdits ?? {},
      ),
    };
    await this.contentRepository.updateEditableState(
      contentId,
      {
        outputs: nextOutputs,
        userEdits: snapshot.userEdits,
        nodePromptOverrides: snapshot.nodePromptOverrides,
        nodeOutputs: mergedNodeOutputs,
        nodeUserEdits: snapshot.nodeUserEdits,
      },
      auth,
    );
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
    nodeOutputs?: Record<string, Record<string, unknown>>;
    nodeUserEdits?: Record<string, Record<string, unknown>>;
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
    nodeOutputs: Record<string, Record<string, unknown>>;
    nodeUserEdits: Record<string, Record<string, unknown>>;
  } {
    if (
      content.outputs ||
      content.userEdits ||
      content.nodePromptOverrides ||
      content.nodeOutputs ||
      content.nodeUserEdits
    ) {
      return {
        outputs: content.outputs ?? {},
        userEdits: content.userEdits ?? {},
        nodePromptOverrides: content.nodePromptOverrides ?? {},
        nodeOutputs: content.nodeOutputs ?? {},
        nodeUserEdits: content.nodeUserEdits ?? {},
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
      nodeOutputs: {},
      nodeUserEdits: {},
    };
  }
}
