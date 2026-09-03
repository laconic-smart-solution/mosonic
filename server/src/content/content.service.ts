import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../auth/tenancy.types';
import { ContentCreditUsageService } from '../credit/content-credit-usage.service';
import { CreditCalculationService } from '../credit/credit-calculation.service';
import { InsufficientCreditsException } from '../credit/insufficient-credits.exception';
import { CreditService } from '../credit/credit.service';
import { NodeCreditPriceService } from '../credit/node-credit-price.service';
import { resolveCreditNodeTypeForPipelineNode } from '../credit/lib/video-credit-node-type.util';
import { NodeExecutor } from '../orchestration/node-executor.service';
import type { PreviousOutputs } from '../nodes/types/node-execution.types';
import {
  WorkflowNodeType,
  type WorkflowNodeConfig,
} from '../nodes/schemas/workflow-node.schema';
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
import { resolveRerunWorkflowNodeId } from './content-rerun-node-resolve.util';
import { buildContentRerunPreviousOutputs } from './content-rerun-previous-outputs.util';
import { buildNodeOutputMapFromPipeline } from '../pipeline/pipeline-output-parse';
import { flattenNodeOutputsToAiOutputs } from './content-node-output.util';
import type { IContentRepository } from '../repositories/interfaces/content.repository.interface';
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
} from './schemas/content.schema';
import type {
  ContentOutputs,
  ContentRecord,
  ContentUserEdits,
} from '../domain/content/content.types';
import type { PipelineRecord } from '../domain/pipeline/pipeline.types';
import type { WorkflowNodeRecord } from '../domain/workflow/workflow.types';
import type {
  IRuleRepository,
  RuleRecord,
} from '../repositories/interfaces/rule.repository.interface';
import type { IPipelineRepository } from '../repositories/interfaces/pipeline.repository.interface';
import type { IWorkflowNodeRepository } from '../repositories/interfaces/workflow-node.repository.interface';
import type { IUserPlanRepository } from '../repositories/interfaces/user-plan.repository.interface';
import {
  CONTENT_REPOSITORY,
  PIPELINE_REPOSITORY,
  RULE_REPOSITORY,
  USER_PLAN_REPOSITORY,
  WORKFLOW_NODE_REPOSITORY,
} from '../repositories/tokens';
import {
  parsePipelineGraph,
  parsePipelineNodes,
} from '../repositories/prisma/pipeline-nodes.util';

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
  creditUsage?: {
    totalCredits: number;
    byNodeId: Record<string, number>;
  };
};

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    @Inject(CONTENT_REPOSITORY)
    private readonly contentRepository: IContentRepository,
    private readonly events: EventsService,
    @Inject(forwardRef(() => UploadService))
    private readonly uploadService: UploadService,
    private readonly workflowService: WorkflowService,
    private readonly nodeExecutor: NodeExecutor,
    private readonly creditService: CreditService,
    private readonly nodeCreditPriceService: NodeCreditPriceService,
    private readonly creditCalculation: CreditCalculationService,
    private readonly contentCreditUsage: ContentCreditUsageService,
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelines: IPipelineRepository,
    @Inject(WORKFLOW_NODE_REPOSITORY)
    private readonly workflowNodes: IWorkflowNodeRepository,
    @Inject(RULE_REPOSITORY)
    private readonly rules: IRuleRepository,
    @Inject(USER_PLAN_REPOSITORY)
    private readonly userPlans: IUserPlanRepository,
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
    const [uploadMap, creditTotals] = await Promise.all([
      this.uploadService.mapLatestUploadIdByContentRef(refs, auth),
      this.contentCreditUsage.getTotalsForContents(
        auth.userId,
        result.data.map((row) => ({
          contentId: row.contentId,
          pipelineRef: row.pipelineRef,
        })),
      ),
    ]);
    return {
      total: result.total,
      data: result.data.map((row) => ({
        ...row,
        uploadId: uploadMap.get(row.contentId),
        creditsUsed: creditTotals.get(row.contentId) ?? 0,
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
    const approval = this.parseApprovalState(doc.approval);
    const snapshot = this.resolveEditableState(doc);
    const workflowNodesOrdered = await this.loadWorkflowNodesOrdered(
      doc.workflowRef,
      auth,
    );
    const pipeline = await this.pipelines.findById(doc.pipelineRef, auth);
    const pipelineNodesOrdered = this.pipelineNodesForMerge(pipeline);
    const nodeOutputs = {
      ...buildNodeOutputMapFromPipeline(pipeline?.nodes),
      ...(snapshot.nodeOutputs ?? {}),
    };
    const outputs = mergeResolvedOutputs(
      { ...snapshot, nodeOutputs },
      {
        ...(pipelineNodesOrdered.length > 0
          ? { pipelineNodesOrdered }
          : { workflowNodesOrdered }),
      },
    );

    const createdAtRaw = (doc as { createdAt?: Date }).createdAt;
    const updatedAtRaw = (doc as { updatedAt?: Date }).updatedAt;

    const metadata =
      pipeline?.metadata && typeof pipeline.metadata === 'object'
        ? (pipeline.metadata as {
            source?: string;
            newsMeta?: {
              title: string;
              url: string;
              sourceId: string;
              publishedAt: string;
              relevanceScore: number;
              suggestedAngle?: string;
            };
          })
        : null;
    const newsMeta =
      metadata?.source === 'news' && metadata.newsMeta
        ? {
            title: metadata.newsMeta.title,
            url: metadata.newsMeta.url,
            sourceId: metadata.newsMeta.sourceId,
            publishedAt: metadata.newsMeta.publishedAt,
            relevanceScore: metadata.newsMeta.relevanceScore,
            suggestedAngle: metadata.newsMeta.suggestedAngle ?? '',
          }
        : null;

    const pipelineNodesForCredits = parsePipelineNodes(pipeline?.nodes).map(
      (n) => ({
        nodeId: n.nodeId,
        type: String(n.type),
        status: n.status ? String(n.status) : undefined,
      }),
    );
    const creditUsage = await this.contentCreditUsage.getUsageForContent(
      auth.userId,
      doc.contentId,
      doc.pipelineRef,
      pipelineNodesForCredits,
    );

    return {
      contentId: doc.contentId,
      pipelineRef: doc.pipelineRef,
      workflowRef: doc.workflowRef,
      ruleRef: doc.ruleRef,
      status: doc.status,
      outputs,
      nodeOutputs,
      nodeUserEdits: snapshot.nodeUserEdits ?? {},
      approval,
      variantId: doc.variantId ?? null,
      experimentId: doc.experimentId ?? null,
      newsMeta,
      creditUsage,
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
    const plain = doc;
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

    const pipeline = await this.pipelines.findById(content.pipelineRef, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${content.pipelineRef} not found`);
    }

    const pipelineNodes = parsePipelineNodes(pipeline.nodes);
    const pipelineGraph = parsePipelineGraph(pipeline.graph);
    const workflowNodeRecords = await this.workflowNodes.findByWorkflow(
      content.workflowRef,
      auth,
    );
    const workflowNodesForResolve = workflowNodeRecords.map((n) => ({
      nodeId: n.nodeId,
      type: typeof n.type === 'string' ? n.type : String(n.type ?? ''),
      config: n.config,
    }));

    const rerunTarget = resolveRerunWorkflowNodeId(
      dto.nodeId,
      workflowNodesForResolve,
      pipelineNodes,
      pipelineGraph.lanes,
    );
    if (!rerunTarget) {
      throw new NotFoundException(
        `Workflow node ${dto.nodeId} not found for workflow`,
      );
    }

    const wfNodeRecord = await this.workflowNodes.findByWorkflowAndNodeId(
      content.workflowRef,
      rerunTarget.workflowNodeId,
      auth,
    );

    const pipelineNode = pipelineNodes.find(
      (n) => n.nodeId === rerunTarget.outputNodeId,
    );

    const wfNode =
      wfNodeRecord ??
      (pipelineNode
        ? ({
            nodeId: rerunTarget.workflowNodeId,
            workflowRef: content.workflowRef,
            userId: auth.userId ?? null,
            type: pipelineNode.type as WorkflowNodeRecord['type'],
            order: pipelineNode.order,
            isLocked: pipelineNode.isLocked,
            userPrompt: pipelineNode.userPrompt || null,
            config: pipelineNode.config as Prisma.JsonValue,
            lane: pipelineNode.lane,
            x: null,
            y: null,
            isGenerateMoreOnly: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          } satisfies WorkflowNodeRecord)
        : null);

    if (!wfNode) {
      throw new NotFoundException(
        `Workflow node ${dto.nodeId} not found for workflow`,
      );
    }

    const rule = await this.rules.findById(content.ruleRef, auth);
    if (!rule) {
      throw new NotFoundException(`Rule ${content.ruleRef} not found`);
    }

    const workflowNodesOrdered = workflowNodeRecords.map((n) => ({
      nodeId: n.nodeId,
      type: typeof n.type === 'string' ? n.type : String(n.type ?? ''),
    }));
    const editableSnapshot = this.resolveEditableState(content);
    const ancestorOutputs = buildContentRerunPreviousOutputs(
      pipeline,
      rerunTarget.outputNodeId,
      editableSnapshot.nodeOutputs ?? {},
      editableSnapshot.nodeUserEdits ?? {},
    );
    /** Resolved outputs match what the user sees (edits over AI). */
    const resolved = mergeResolvedOutputs(editableSnapshot, {
      workflowNodesOrdered,
      pipelineNodesOrdered: this.pipelineNodesForMerge(pipeline),
    });
    const previousOutputsFromDb: PreviousOutputs = {
      keywords: ancestorOutputs.keywords ?? resolved.keywords,
      text: ancestorOutputs.text ?? resolved.text,
      image: ancestorOutputs.image ?? resolved.image,
      translatedText: ancestorOutputs.translatedText ?? resolved.translatedText,
      video: ancestorOutputs.video ?? resolved.video,
      transcription: ancestorOutputs.transcription ?? resolved.transcription,
      summary: ancestorOutputs.summary ?? resolved.summary,
      intelligenceBrief: ancestorOutputs.intelligenceBrief,
      intelligenceHints: ancestorOutputs.intelligenceHints,
    };
    const previousOutputs = this.mergeRerunPreviousOutputs(
      previousOutputsFromDb,
      dto.previousOutputs,
    );

    let nodeForRun = wfNode;
    const pipelineConfig = this.asRecord(pipelineNode?.config);
    const baseConfig = {
      ...this.asRecord(wfNode.config),
      ...pipelineConfig,
    };
    if (dto.updatedConfig && Object.keys(dto.updatedConfig).length > 0) {
      try {
        const mergedConfig = parseWorkflowNodeConfigOrThrow(
          wfNode.type as unknown as WorkflowNodeType,
          {
            ...baseConfig,
            ...dto.updatedConfig,
          },
        );
        if (wfNodeRecord) {
          await this.workflowNodes.updateConfig(
            content.workflowRef,
            rerunTarget.workflowNodeId,
            mergedConfig as unknown as Prisma.InputJsonValue,
            auth,
          );
        }
        nodeForRun = {
          ...wfNode,
          config: mergedConfig as unknown as Prisma.JsonValue,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Ignoring invalid re-run config for ${rerunTarget.outputNodeId}: ${msg}`,
        );
        if (Object.keys(baseConfig).length > 0) {
          nodeForRun = {
            ...wfNode,
            config: parseWorkflowNodeConfigOrThrow(
              wfNode.type as unknown as WorkflowNodeType,
              baseConfig,
            ) as unknown as Prisma.JsonValue,
          };
        }
      }
    } else if (Object.keys(baseConfig).length > 0) {
      nodeForRun = {
        ...wfNode,
        config: parseWorkflowNodeConfigOrThrow(
          wfNode.type as unknown as WorkflowNodeType,
          baseConfig,
        ) as unknown as Prisma.JsonValue,
      };
    }

    const creditsCharged = await this.chargeForContentNode({
      userId: auth.userId,
      contentId: content.contentId,
      pipelineId: pipeline.pipelineId,
      nodeId: rerunTarget.outputNodeId,
      nodeType: nodeForRun.type,
      nodeConfig: this.asRecord(nodeForRun.config),
    });

    void this.runRerunExecution({
      content,
      pipeline,
      wfNode: nodeForRun,
      outputNodeId: rerunTarget.outputNodeId,
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

    const pipeline = await this.pipelines.findById(content.pipelineRef, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${content.pipelineRef} not found`);
    }

    const rule = await this.rules.findById(content.ruleRef, auth);
    if (!rule) {
      throw new NotFoundException(`Rule ${content.ruleRef} not found`);
    }

    const workflowNodesOrdered = await this.loadWorkflowNodesOrdered(
      content.workflowRef,
      auth,
    );
    const resolved = mergeResolvedOutputs(this.resolveEditableState(content), {
      workflowNodesOrdered,
    });

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
    const baseConfig = defaultWorkflowNodeConfigForRule(
      dto.type,
      rule as unknown as Parameters<typeof defaultWorkflowNodeConfigForRule>[1],
    );
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
      nodeConfig: config as Record<string, unknown>,
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
    const userPlan = await this.userPlans.findActiveByUserId(userId);
    return userPlan?.creditsRemaining ?? 0;
  }

  private async chargeForContentNode(args: {
    userId: string;
    contentId: string;
    pipelineId: string;
    nodeId: string;
    nodeType: string;
    nodeConfig?: Record<string, unknown>;
  }): Promise<number> {
    const creditNodeType = resolveCreditNodeTypeForPipelineNode(
      args.nodeType,
      args.nodeConfig,
    );
    const creditsEach =
      (await this.nodeCreditPriceService.getActiveCostCredit(creditNodeType)) ??
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
      nodeType: creditNodeType,
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
    nodeConfig?: Record<string, unknown>;
    credits: number;
  }): Promise<void> {
    if (args.credits <= 0) return;
    const creditNodeType = resolveCreditNodeTypeForPipelineNode(
      args.nodeType,
      args.nodeConfig,
    );
    const config = await this.creditCalculation.getConfig();
    await this.creditService.refundSingleNodeRun({
      userId: args.userId,
      pipelineRef: args.pipelineId,
      contentRef: args.contentId,
      nodeId: args.nodeId,
      nodeType: creditNodeType,
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
    content: ContentRecord;
    pipeline: PipelineRecord;
    rule: RuleRecord;
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
      const totalNodes = await this.workflowNodes.countByWorkflow(
        content.workflowRef,
        auth,
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
          rule: rule as unknown as Parameters<
            NodeExecutor['execute']
          >[0]['context']['rule'],
          contentPrompt,
          previousOutputs,
        },
        pipelineId: pipeline.pipelineId,
        totalNodes: Math.max(totalNodes, 1),
        contentId: content.contentId,
        userId: pipeline.userId ?? content.userId ?? undefined,
        ruleId: rule.ruleId,
      });
      await this.persistNodeCompletion(
        content.contentId,
        content.workflowRef,
        nodeId,
        result.output,
        auth,
      );
    } catch {
      await this.refundContentNodeCharge({
        userId,
        contentId: content.contentId,
        pipelineId: pipeline.pipelineId,
        nodeId,
        nodeType: dto.type,
        nodeConfig: config as Record<string, unknown>,
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
    content: ContentRecord;
    pipeline: PipelineRecord;
    wfNode: WorkflowNodeRecord;
    outputNodeId: string;
    rule: RuleRecord;
    dto: RerunNodeDto;
    previousOutputs: PreviousOutputs;
    auth: TenancyAuth;
    creditsCharged: number;
  }): Promise<void> {
    const {
      content,
      pipeline,
      wfNode,
      outputNodeId,
      rule,
      dto,
      previousOutputs,
      auth,
      creditsCharged,
    } = args;
    const userId = auth.userId;
    // A follow-up message for this specific re-run overrides the pipeline's
    // original content prompt for this run only — the workflow/pipeline itself is untouched.
    const contentPrompt = dto.message?.trim() || pipeline.contentPrompt;
    try {
      const totalNodes = await this.workflowNodes.countByWorkflow(
        content.workflowRef,
        auth,
      );
      const result = await this.nodeExecutor.execute({
        node: {
          nodeId: wfNode.nodeId,
          type: wfNode.type as unknown as WorkflowNodeType,
          order: wfNode.order,
          config: this.asRecord(wfNode.config),
          workflowRef: content.workflowRef,
        },
        context: {
          rule: rule as unknown as Parameters<
            NodeExecutor['execute']
          >[0]['context']['rule'],
          contentPrompt,
          previousOutputs,
        },
        pipelineId: pipeline.pipelineId,
        totalNodes: Math.max(totalNodes, 1),
        contentId: content.contentId,
        userId: pipeline.userId ?? content.userId ?? undefined,
        ruleId: rule.ruleId,
        contentOutputNodeId: outputNodeId,
      });
      await this.persistNodeCompletion(
        content.contentId,
        content.workflowRef,
        outputNodeId,
        result.output,
        auth,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Re-run failed. Please try again.';
      this.events.emitToContent(content.contentId, 'node:failed_final', {
        contentId: content.contentId,
        nodeId: outputNodeId,
        message,
      });
      await this.refundContentNodeCharge({
        userId,
        contentId: content.contentId,
        pipelineId: pipeline.pipelineId,
        nodeId: outputNodeId,
        nodeType: wfNode.type,
        nodeConfig: this.asRecord(wfNode.config),
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
    return doc;
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
    const status = doc.status;
    if (status !== ContentStatus.Draft && status !== ContentStatus.InReview) {
      throw new BadRequestException(
        'Only draft or in-review content can be approved',
      );
    }

    const approval = this.parseApprovalState(doc.approval);
    const steps = approval.steps ?? [];
    if (steps.length === 0) {
      return this.applyDraftApproval(doc, auth);
    }

    const pendingIndex = nextPendingStepIndex(approval);
    if (pendingIndex === null) {
      return this.applyDraftApproval(doc, auth);
    }
    const nextApproval = appendApprovalRecord(approval, {
      stepIndex: pendingIndex,
      userId: auth.userId,
      at: new Date(),
      comment: comment ?? null,
    });

    if (!allRequiredStepsApproved(nextApproval)) {
      await this.contentRepository.updateStatus(
        contentId,
        ContentStatus.InReview,
        auth,
      );
      this.events.emitToContent(contentId, 'content:step_approved', {
        contentId,
        stepIndex: pendingIndex,
        status: ContentStatus.InReview,
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
    const status = doc.status;
    if (status === ContentStatus.Approved) {
      return;
    }
    if (status !== ContentStatus.Draft && status !== ContentStatus.InReview) {
      throw new BadRequestException(
        'This content cannot be published in its current state.',
      );
    }
    if (!allRequiredStepsApproved(this.parseApprovalState(doc.approval))) {
      throw new BadRequestException('Approval steps are incomplete');
    }
    await this.applyDraftApproval(doc, auth);
  }

  private async applyDraftApproval(
    doc: ContentRecord,
    auth: TenancyAuth,
  ): Promise<{ uploadId: string }> {
    const rule = await this.rules.findById(doc.ruleRef, auth);
    if (!rule) {
      throw new NotFoundException(`Rule ${doc.ruleRef} not found`);
    }

    const pipeline = await this.pipelines.findById(doc.pipelineRef, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${doc.pipelineRef} not found`);
    }

    const snapshot = this.resolveEditableState(doc);
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

    const ruleChannels = Array.isArray(rule.channels) ? rule.channels : [];
    const channels = this.uploadService.buildChannelEntriesFromPipeline(
      ruleChannels as never[],
      pipeline as never,
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
        ruleChannels: ruleChannels as never[],
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
      const rule = await this.rules.findById(doc.ruleRef, auth);
      if (!rule) {
        throw new NotFoundException(`Rule ${doc.ruleRef} not found`);
      }
      const pipeline = await this.pipelines.findById(doc.pipelineRef, auth);
      if (!pipeline) {
        throw new NotFoundException(`Pipeline ${doc.pipelineRef} not found`);
      }
      const snapshot = this.resolveEditableState(doc);
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
      const ruleChannels = Array.isArray(rule.channels) ? rule.channels : [];
      const channels = this.uploadService.buildChannelEntriesFromPipeline(
        ruleChannels as never[],
        pipeline as never,
        resolvedOutputs,
      );
      return this.uploadService.createUpload({
        userId: auth.userId,
        contentRef: doc.contentId,
        workflowRef: doc.workflowRef,
        ruleRef: doc.ruleRef,
        resolvedOutputs,
        ruleChannels: ruleChannels as never[],
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

  buildApprovalFromRule(rule: {
    approvalPolicy?: Array<{ role: string; required: boolean }>;
  }) {
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
    const nodes = await this.workflowNodes.findByWorkflow(workflowRef, auth);
    return nodes.map((n) => ({
      nodeId: n.nodeId,
      type: typeof n.type === 'string' ? n.type : String(n.type ?? ''),
    }));
  }

  private pipelineNodesForMerge(
    pipeline: PipelineRecord | null | undefined,
  ): Array<{ nodeId: string; type: string; order: number }> {
    const nodes = parsePipelineNodes(pipeline?.nodes);
    if (!nodes.length) return [];
    return [...nodes]
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
    const snapshot = this.resolveEditableState(doc);
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

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private parseApprovalState(value: unknown): ContentApprovalState {
    const raw = this.asRecord(value);
    const steps = Array.isArray(raw.steps) ? raw.steps : [];
    const records = Array.isArray(raw.records) ? raw.records : [];
    return {
      steps: steps as ContentApprovalState['steps'],
      currentStepIndex:
        typeof raw.currentStepIndex === 'number' ? raw.currentStepIndex : 0,
      records: records as ContentApprovalState['records'],
    };
  }

  private resolveEditableState(content: {
    outputs?: unknown;
    userEdits?: unknown;
    nodePromptOverrides?: unknown;
    nodeOutputs?: unknown;
    nodeUserEdits?: unknown;
    versions?: unknown;
    currentVersion?: number | null;
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
        outputs: this.asRecord(content.outputs),
        userEdits: this.asRecord(content.userEdits),
        nodePromptOverrides: this.asRecord(
          content.nodePromptOverrides,
        ) as Record<string, string>,
        nodeOutputs: this.asRecord(content.nodeOutputs) as Record<
          string,
          Record<string, unknown>
        >,
        nodeUserEdits: this.asRecord(content.nodeUserEdits) as Record<
          string,
          Record<string, unknown>
        >,
      };
    }

    const versions = Array.isArray(content.versions)
      ? (content.versions as Array<Record<string, unknown>>)
      : [];
    const preferred =
      versions.find((v) => v.versionNumber === content.currentVersion) ??
      versions.at(-1);
    return {
      outputs: this.asRecord(preferred?.outputs),
      userEdits: this.asRecord(preferred?.userEdits),
      nodePromptOverrides: this.asRecord(
        preferred?.nodePromptOverrides,
      ) as Record<string, string>,
      nodeOutputs: {},
      nodeUserEdits: {},
    };
  }
}
