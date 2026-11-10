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
import { SourcePackBuilderService } from '../orchestration/source-pack-builder.service';
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
import { normalizeVideoNodeType } from '../nodes/video-node-type.util';
import { generateMoreOutputMissing } from './generate-more-outcome.util';
import { mergeResolvedOutputs } from './content-output.utils';
import { resolveRerunWorkflowNodeId } from './content-rerun-node-resolve.util';
import { buildContentRerunPreviousOutputs } from './content-rerun-previous-outputs.util';
import { mergeRerunSourcePack } from './content-rerun-source-pack.util';
import {
  forcePreviousImageFirst,
  resolveImageRerunSourcePack,
} from './image-rerun-source-pack.util';
import {
  applyNodeOutputToDraft,
  buildDraftNodeCatalog,
  laneFromNodeOutput,
  type DraftNodeCatalog,
} from './content-draft-nodes.util';
import { buildNodeOutputMapFromPipeline } from '../pipeline/pipeline-output-parse';
import {
  flattenNodeOutputsFromPipeline,
  flattenNodeOutputsToAiOutputs,
} from './content-node-output.util';
import {
  emptySourcePack,
  parsePipelineSourcePack,
  type PipelineSourcePack,
} from '../pipeline/source-pack.types';
import type { UploadedFileLike } from '../preprocessing/preprocessed.types';import type { IContentRepository } from '../repositories/interfaces/content.repository.interface';
import type {
  ContentPageItemDto,
  ContentPageQueryDto,
} from './dto/content-page-query.dto';
import type { GenerateNodeDto } from './dto/generate-node.dto';
import type { RerunNodeDto } from './dto/rerun-node.dto';
import type { SaveContentDto } from './dto/save-content.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { RegenerateSectionDto } from './dto/regenerate-section.dto';
import { compileSectionsToMarkdown, parseMarkdownToSections } from './content-markdown-compiler.util';
import type { ContentSectionItem } from './schemas/structured-content.schema';
import { TextGenerationService } from '../nodes/services/text-generation.service';
import { Optional } from '@nestjs/common';
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
  /** Channel lanes + per-node previews for chat / review channel switchers. */
  lanes: string[];
  nodes: DraftNodeCatalog['nodes'];
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
  /** Serializes re-runs of the same draft so "all channels" does not clobber writes. */
  private readonly rerunChains = new Map<string, Promise<void>>();

  constructor(
    @Inject(CONTENT_REPOSITORY)
    private readonly contentRepository: IContentRepository,
    private readonly events: EventsService,
    @Inject(forwardRef(() => UploadService))
    private readonly uploadService: UploadService,
    private readonly workflowService: WorkflowService,
    private readonly nodeExecutor: NodeExecutor,
    private readonly sourcePackBuilder: SourcePackBuilderService,
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
    @Optional()
    private readonly textGeneration?: TextGenerationService,
  ) {}

  async describeDraftNodes(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<DraftNodeCatalog> {
    const content = await this.contentRepository.findById(contentId, auth);
    if (!content) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }
    const workflowNodes = await this.workflowNodes.findByWorkflow(
      content.workflowRef,
      auth,
    );
    const pipeline = await this.pipelines.findById(content.pipelineRef, auth);
    const snapshot = this.resolveEditableState(content);
    return buildDraftNodeCatalog({
      workflowNodes: workflowNodes.map((node) => ({
        nodeId: node.nodeId,
        type: String(node.type),
        order: node.order,
        lane: node.lane,
        config: node.config,
        isGenerateMoreOnly: node.isGenerateMoreOnly === true,
      })),
      pipelineNodes: parsePipelineNodes(pipeline?.nodes).map((node) => ({
        nodeId: node.nodeId,
        type: String(node.type),
        order: node.order,
        lane: node.lane,
        config: node.config,
      })),
      nodeOutputs: snapshot.nodeOutputs,
      nodeUserEdits: snapshot.nodeUserEdits,
    });
  }

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

    const workflowNodesFull = await this.workflowNodes.findByWorkflow(
      doc.workflowRef,
      auth,
    );
    const catalog = buildDraftNodeCatalog({
      workflowNodes: workflowNodesFull.map((node) => ({
        nodeId: node.nodeId,
        type: String(node.type),
        order: node.order,
        lane: node.lane,
        config: node.config,
        isGenerateMoreOnly: node.isGenerateMoreOnly === true,
      })),
      pipelineNodes: parsePipelineNodes(pipeline?.nodes).map((node) => ({
        nodeId: node.nodeId,
        type: String(node.type),
        order: node.order,
        lane: node.lane,
        config: node.config,
      })),
      nodeOutputs,
      nodeUserEdits: snapshot.nodeUserEdits ?? {},
    });

    return {
      contentId: doc.contentId,
      pipelineRef: doc.pipelineRef,
      workflowRef: doc.workflowRef,
      ruleRef: doc.ruleRef,
      status: doc.status,
      outputs,
      nodeOutputs,
      nodeUserEdits: snapshot.nodeUserEdits ?? {},
      lanes: catalog.lanes,
      nodes: catalog.nodes,
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
    const pipeline = await this.pipelines.findById(plain.pipelineRef, auth);
    const pipelineNodesOrdered = this.pipelineNodesForMerge(pipeline);
    const nextNodeOutputs = {
      ...(snapshot.nodeOutputs ?? {}),
      ...(dto.nodeOutputs ?? {}),
    };
    const existingLaneOutputs = this.asRecord(
      (plain as { laneOutputs?: unknown }).laneOutputs,
    ) as Record<string, Record<string, unknown>>;
    const nextLaneOutputs = dto.laneOutputs
      ? { ...existingLaneOutputs, ...dto.laneOutputs }
      : existingLaneOutputs;

    let nextOutputs: ContentOutputs = {
      ...snapshot.outputs,
      ...(pipelineNodesOrdered.length > 0
        ? flattenNodeOutputsFromPipeline(
            pipelineNodesOrdered,
            nextNodeOutputs,
            nextNodeUserEdits,
          )
        : flattenNodeOutputsToAiOutputs(
            workflowNodesOrdered,
            nextNodeOutputs,
            nextNodeUserEdits,
          )),
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
        nodeOutputs: nextNodeOutputs,
        nodeUserEdits: nextNodeUserEdits,
        laneOutputs: nextLaneOutputs,
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
        pipelineNodesOrdered.length > 0
          ? { pipelineNodesOrdered }
          : { workflowNodesOrdered },
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
    attachments?: {
      files?: UploadedFileLike[];
      urls?: string[];
    },
  ): Promise<{
    outputNodeId: string;
    workflowNodeId: string;
    nodeType: string;
  }> {
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

    const editingImage =
      dto.mode === 'edit' &&
      ((wfNode.type as unknown as string) === WorkflowNodeType.ImageGeneration ||
        (wfNode.type as unknown as string) === 'image_generation');
    if (editingImage && !previousOutputs.image?.trim()) {
      throw new BadRequestException(
        'This image has no picture to edit yet.',
      );
    }

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

    const existingPack =
      parsePipelineSourcePack(pipeline.sourcePack) ?? emptySourcePack();
    const attachFiles = attachments?.files ?? [];
    const attachUrls = (attachments?.urls ?? [])
      .map((u) => u.trim())
      .filter(Boolean);
    let sourcePack: PipelineSourcePack = existingPack;
    if (attachFiles.length > 0 || attachUrls.length > 0) {
      const brand =
        rule.brand &&
        typeof rule.brand === 'object' &&
        !Array.isArray(rule.brand) &&
        typeof (rule.brand as { brandName?: unknown }).brandName === 'string'
          ? (rule.brand as { brandName: string }).brandName
          : undefined;
      const fresh = await this.sourcePackBuilder.build({
        contentPrompt:
          dto.message?.trim() || pipeline.contentPrompt || '',
        files: attachFiles,
        urls: attachUrls,
        brandName: brand,
        storageKey: content.contentId,
      });
      sourcePack = mergeRerunSourcePack(existingPack, fresh);
    }

    const hadNewAttachments =
      attachFiles.length > 0 || attachUrls.length > 0;

    await this.setNodeRerunPending(
      content.contentId,
      rerunTarget.outputNodeId,
      true,
      auth,
    );
    this.events.emitToContent(content.contentId, 'node:started', {
      contentId: content.contentId,
      nodeId: rerunTarget.outputNodeId,
      nodeType: String(nodeForRun.type),
      order: 1,
      totalNodes: 1,
    });
    this.enqueueRerun(content.contentId, () =>
      this.runRerunExecution({
        content,
        pipeline,
        wfNode: nodeForRun,
        outputNodeId: rerunTarget.outputNodeId,
        rule,
        dto,
        previousOutputs,
        sourcePack,
        hadNewAttachments,
        auth,
        creditsCharged,
      }),
    );

    // Chat cards poll / listen using this id — must match setNodeRerunPending + emits.
    return {
      outputNodeId: rerunTarget.outputNodeId,
      workflowNodeId: rerunTarget.workflowNodeId,
      nodeType: String(nodeForRun.type),
    };
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
      WorkflowNodeType.VideoPresenter,
      WorkflowNodeType.VideoCinematic,
      WorkflowNodeType.VideoGeneration,
      WorkflowNodeType.Summarization,
      WorkflowNodeType.Translation,
      WorkflowNodeType.ImageGeneration,
      WorkflowNodeType.Adapt,
    ];
    // "Generate more" is also used to re-generate an existing output type.
    // (Re-run exists too, but generate-more can create a new variant with optional instructions.)
    return candidates;
  }

  /** Puts a generate-more lane on the linked upload so the publish tab appears. */
  async syncUploadLane(
    contentId: string,
    lane: string,
    auth: TenancyAuth,
  ): Promise<void> {
    const content = await this.contentRepository.findById(contentId, auth);
    if (!content) return;
    const laneKey = lane.trim().toLowerCase();
    const laneOutputs = this.asRecord(
      (content as { laneOutputs?: unknown }).laneOutputs,
    ) as Record<string, Record<string, unknown>>;
    const layer = laneOutputs[laneKey];
    const caption =
      typeof layer?.text === 'string' ? layer.text : undefined;
    const mediaUrl =
      typeof layer?.image === 'string'
        ? layer.image
        : typeof layer?.video === 'string'
          ? layer.video
          : undefined;
    await this.uploadService.ensureLaneChannelOnContent(
      contentId,
      lane,
      { caption, mediaUrl },
      auth,
    );
  }

  async scheduleGenerateNode(
    contentId: string,
    dto: GenerateNodeDto,
    auth: TenancyAuth,
    attachments?: {
      files?: UploadedFileLike[];
      urls?: string[];
    },
  ): Promise<{ success: true; nodeId: string }> {
    // Legacy `video_generation` requests become presenter/cinematic by config.mode.
    dto = { ...dto, type: normalizeVideoNodeType(dto.type, dto.config) };
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

    const direction =
      dto.message?.trim() || dto.userPrompt?.trim() || undefined;

    const { order } = await this.workflowService.appendWorkflowNode(
      content.workflowRef,
      {
        nodeId,
        type: dto.type,
        config,
        userPrompt: direction,
      },
      auth,
    );

    const generateMoreLane =
      typeof (config as { laneId?: unknown }).laneId === 'string'
        ? (config as { laneId: string }).laneId
        : typeof (config as { channel?: unknown }).channel === 'string'
          ? (config as { channel: string }).channel
          : null;
    if (generateMoreLane) {
      await this.uploadService
        .ensureLaneChannelOnContent(
          content.contentId,
          generateMoreLane,
          {},
          auth,
        )
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Could not add ${generateMoreLane} to upload for ${content.contentId}: ${msg}`,
          );
        });
    }

    const creditsCharged = await this.chargeForContentNode({
      userId: auth.userId,
      contentId: content.contentId,
      pipelineId: pipeline.pipelineId,
      nodeId,
      nodeType: dto.type,
      nodeConfig: config as Record<string, unknown>,
    });

    const existingPack =
      parsePipelineSourcePack(pipeline.sourcePack) ?? emptySourcePack();
    const attachFiles = attachments?.files ?? [];
    const attachUrls = (attachments?.urls ?? [])
      .map((u) => u.trim())
      .filter(Boolean);
    let sourcePack: PipelineSourcePack = existingPack;
    if (attachFiles.length > 0 || attachUrls.length > 0) {
      const brand =
        rule.brand &&
        typeof rule.brand === 'object' &&
        !Array.isArray(rule.brand) &&
        typeof (rule.brand as { brandName?: unknown }).brandName === 'string'
          ? (rule.brand as { brandName: string }).brandName
          : undefined;
      const fresh = await this.sourcePackBuilder.build({
        contentPrompt: direction || pipeline.contentPrompt || '',
        files: attachFiles,
        urls: attachUrls,
        brandName: brand,
        storageKey: content.contentId,
      });
      // Prefer fresh attachments for this variant; keep original pack notes.
      // Do NOT inject previous_output — Generate More is another shot, not a tweak.
      sourcePack = mergeRerunSourcePack(existingPack, fresh);
    }

    // Mark the new step as rendering so status reads pending (not empty) until it lands or fails.
    await this.setNodeRerunPending(content.contentId, nodeId, true, auth).catch(
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Could not mark generate-more ${nodeId} pending: ${msg}`);
      },
    );

    void this.runGenerateMoreExecution({
      content,
      pipeline,
      rule,
      dto,
      nodeId,
      order,
      config,
      previousOutputs: previousOutputsFromDb,
      sourcePack,
      contentPrompt: direction || pipeline.contentPrompt,
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
      case WorkflowNodeType.VideoPresenter:
      case WorkflowNodeType.VideoCinematic:
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
    sourcePack: PipelineSourcePack;
    contentPrompt: string;
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
      sourcePack,
      contentPrompt,
      auth,
      creditsCharged,
    } = args;
    const userId = auth.userId;
    try {
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
          userPrompt: dto.message?.trim() || dto.userPrompt?.trim() || undefined,
        },
        context: {
          rule: rule as unknown as Parameters<
            NodeExecutor['execute']
          >[0]['context']['rule'],
          contentPrompt,
          previousOutputs,
          sourcePack,
        },
        pipelineId: pipeline.pipelineId,
        totalNodes: Math.max(totalNodes, 1),
        contentId: content.contentId,
        userId: pipeline.userId ?? content.userId ?? undefined,
        ruleId: rule.ruleId,
      });
      // No file and no render job back = failed, never a silent "done".
      const missing = generateMoreOutputMissing(dto.type, result.output);
      if (missing) throw new Error(missing);
      const laneFromConfig =
        typeof (config as { laneId?: unknown }).laneId === 'string'
          ? (config as { laneId: string }).laneId
          : typeof (config as { channel?: unknown }).channel === 'string'
            ? (config as { channel: string }).channel
            : null;
      await this.persistNodeCompletion(
        content.contentId,
        content.workflowRef,
        nodeId,
        result.output,
        auth,
        { lane: laneFromConfig },
      );
      await this.setNodeRerunPending(content.contentId, nodeId, false, auth).catch(
        () => undefined,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Generate-more node failed (${dto.type} ${nodeId}, content ${content.contentId}): ${msg}`,
      );
      // Record the failure on the draft and tell the client, so chat and UI
      // see "failed" (get_draft_media_status) instead of nothing.
      await this.markGenerateMoreFailed(
        content.contentId,
        nodeId,
        String(dto.type),
        msg,
        auth,
      ).catch((markErr: unknown) => {
        const m = markErr instanceof Error ? markErr.message : String(markErr);
        this.logger.warn(`Could not record generate-more failure ${nodeId}: ${m}`);
      });
      this.events.emitToContent(content.contentId, 'node:failed_final', {
        contentId: content.contentId,
        nodeId,
        message: msg,
      });
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
    sourcePack: PipelineSourcePack;
    hadNewAttachments: boolean;
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
      sourcePack,
      hadNewAttachments,
      auth,
      creditsCharged,
    } = args;
    const userId = auth.userId;
    // A follow-up message for this specific re-run overrides the pipeline's
    // original content prompt for this run only — the workflow/pipeline itself is untouched.
    const contentPrompt = dto.message?.trim() || pipeline.contentPrompt;
    const isImageNode =
      (wfNode.type as unknown as string) === WorkflowNodeType.ImageGeneration ||
      (wfNode.type as unknown as string) === 'image_generation';
    const keepScene = isImageNode && dto.mode === 'edit';
    const packForRun = isImageNode
      ? keepScene
        ? forcePreviousImageFirst(sourcePack, previousOutputs.image ?? '')
        : resolveImageRerunSourcePack({
            sourcePack,
            previousImageUrl: previousOutputs.image,
            rerunMessage: dto.message?.trim() ?? '',
            hadNewAttachments,
          })
      : sourcePack;
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
          sourcePack: packForRun,
        },
        pipelineId: pipeline.pipelineId,
        totalNodes: Math.max(totalNodes, 1),
        contentId: content.contentId,
        userId: pipeline.userId ?? content.userId ?? undefined,
        ruleId: rule.ruleId,
        contentOutputNodeId: outputNodeId,
        suppressCompletedEmit: true,
        imageEdit: keepScene
          ? {
              instruction: dto.message?.trim() || '',
              useBrandLogo: dto.useBrandLogo === true,
            }
          : undefined,
      });
      const pipelineNode = parsePipelineNodes(pipeline.nodes).find(
        (node) => node.nodeId === outputNodeId,
      );
      await this.persistNodeCompletion(
        content.contentId,
        content.workflowRef,
        outputNodeId,
        result.output,
        auth,
        {
          workflowNodeId: wfNode.nodeId,
          lane: laneFromNodeOutput(
            outputNodeId,
            result.output,
            [],
            pipelineNode?.lane,
          ),
        },
      );
      this.events.emitToContent(content.contentId, 'node:rerun_completed', {
        contentId: content.contentId,
        nodeId: outputNodeId,
        nodeType: wfNode.type,
        output: result.output,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Re-run failed. Please try again.';
      // Persist error + clear _pending so chat polling sees a terminal failure
      // (same shape as generate-more), not an endless "updating" state.
      await this.markGenerateMoreFailed(
        content.contentId,
        outputNodeId,
        String(wfNode.type),
        message,
        auth,
      ).catch((markErr: unknown) => {
        const m = markErr instanceof Error ? markErr.message : String(markErr);
        this.logger.warn(`Could not record re-run failure ${outputNodeId}: ${m}`);
      });
      this.events.emitToContent(content.contentId, 'node:failed_final', {
        contentId: content.contentId,
        nodeId: outputNodeId,
        nodeType: String(wfNode.type),
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
    extras?: { workflowNodeId?: string; lane?: string | null },
  ): Promise<void> {
    const doc = await this.contentRepository.findByIdLean(contentId, auth);
    if (!doc) return;
    const snapshot = this.resolveEditableState(doc);
    const pipeline = await this.pipelines.findById(doc.pipelineRef, auth);
    const pipelineNodesOrdered = this.pipelineNodesForMerge(pipeline);
    const lane = laneFromNodeOutput(
      nodeId,
      output,
      [],
      extras?.lane,
    );
    const aliasNodeIds = [
      extras?.workflowNodeId,
      lane && extras?.workflowNodeId
        ? `${extras.workflowNodeId}__${lane}`
        : undefined,
    ].filter((id): id is string => Boolean(id) && id !== nodeId);
    const copied = applyNodeOutputToDraft({
      nodeId,
      output,
      userEdits: snapshot.userEdits,
      nodeUserEdits: snapshot.nodeUserEdits ?? {},
      nodeOutputs: snapshot.nodeOutputs ?? {},
      laneOutputs: this.asRecord(
        (doc as { laneOutputs?: unknown }).laneOutputs,
      ) as Record<string, Record<string, unknown>>,
      lane,
      aliasNodeIds,
    });
    const workflowNodesOrdered = await this.loadWorkflowNodesOrdered(
      workflowRef,
      auth,
    );
    const nextOutputs: ContentOutputs = {
      ...snapshot.outputs,
      ...(pipelineNodesOrdered.length > 0
        ? flattenNodeOutputsFromPipeline(
            pipelineNodesOrdered,
            copied.nodeOutputs,
            copied.nodeUserEdits,
          )
        : flattenNodeOutputsToAiOutputs(
            workflowNodesOrdered,
            copied.nodeOutputs,
            copied.nodeUserEdits,
          )),
    };
    await this.contentRepository.updateEditableState(
      contentId,
      {
        outputs: nextOutputs,
        userEdits: copied.userEdits as ContentUserEdits,
        nodePromptOverrides: snapshot.nodePromptOverrides,
        nodeOutputs: copied.nodeOutputs,
        nodeUserEdits: copied.nodeUserEdits,
        laneOutputs: copied.laneOutputs,
      },
      auth,
    );
    if (lane) {
      const caption =
        typeof output.text === 'string' && output.text.trim()
          ? output.text
          : typeof copied.laneOutputs[lane]?.text === 'string'
            ? String(copied.laneOutputs[lane].text)
            : undefined;
      const mediaUrl =
        typeof output.image === 'string' && output.image.trim()
          ? output.image
          : typeof output.video === 'string' && output.video.trim()
            ? output.video
            : undefined;
      await this.uploadService
        .ensureLaneChannelOnContent(
          contentId,
          lane,
          { caption, mediaUrl },
          auth,
        )
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Could not sync ${lane} onto upload for ${contentId}: ${msg}`,
          );
        });
    }
  }

  private enqueueRerun(contentId: string, work: () => Promise<void>): void {
    const prev = this.rerunChains.get(contentId) ?? Promise.resolve();
    const next = prev.then(work, work);
    this.rerunChains.set(contentId, next);
    void next.finally(() => {
      if (this.rerunChains.get(contentId) === next) {
        this.rerunChains.delete(contentId);
      }
    });
  }

  private async markGenerateMoreFailed(
    contentId: string,
    nodeId: string,
    type: string,
    error: string,
    auth: TenancyAuth,
  ): Promise<void> {
    const doc = await this.contentRepository.findByIdLean(contentId, auth);
    if (!doc) return;
    const snapshot = this.resolveEditableState(doc);
    const layer: Record<string, unknown> = {
      ...(snapshot.nodeOutputs[nodeId] ?? {}),
      type,
      error: error.slice(0, 300),
    };
    delete layer._pending;
    await this.contentRepository.updateEditableState(
      contentId,
      {
        outputs: snapshot.outputs,
        userEdits: snapshot.userEdits,
        nodePromptOverrides: snapshot.nodePromptOverrides,
        nodeOutputs: { ...snapshot.nodeOutputs, [nodeId]: layer },
        nodeUserEdits: snapshot.nodeUserEdits,
      },
      auth,
    );
  }

  private async setNodeRerunPending(
    contentId: string,
    nodeId: string,
    pending: boolean,
    auth: TenancyAuth,
  ): Promise<void> {
    const doc = await this.contentRepository.findByIdLean(contentId, auth);
    if (!doc) return;
    const snapshot = this.resolveEditableState(doc);
    const layer = { ...(snapshot.nodeOutputs[nodeId] ?? {}) };
    if (pending) layer._pending = true;
    else delete layer._pending;
    await this.contentRepository.updateEditableState(
      contentId,
      {
        outputs: snapshot.outputs,
        userEdits: snapshot.userEdits,
        nodePromptOverrides: snapshot.nodePromptOverrides,
        nodeOutputs: { ...snapshot.nodeOutputs, [nodeId]: layer },
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
    const keys: Array<keyof Omit<PreviousOutputs, 'sections'>> = [
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
    if (Array.isArray(incoming?.sections)) {
      merged.sections = incoming.sections;
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
  async updateSection(
    contentId: string,
    sectionKey: string,
    dto: UpdateSectionDto,
    auth: TenancyAuth,
  ): Promise<{ success: boolean; section: ContentSectionItem; compiledText: string }> {
    const doc = await this.contentRepository.findById(contentId, auth);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }

    const snapshot = this.resolveEditableState(doc);
    let sections: ContentSectionItem[] = [
      ...(((snapshot.outputs as any)?.sections ||
        (snapshot.userEdits as any)?.sections ||
        []) as ContentSectionItem[]),
    ];

    if (!sections.length && typeof snapshot.outputs?.text === 'string' && snapshot.outputs.text.trim()) {
      sections = parseMarkdownToSections(snapshot.outputs.text);
    }

    const idx = sections.findIndex((s) => s.key === sectionKey);
    if (idx === -1) {
      throw new NotFoundException(`Section "${sectionKey}" not found in content ${contentId}`);
    }

    const updated: ContentSectionItem = {
      ...sections[idx],
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.content !== undefined ? { content: dto.content } : {}),
      ...(dto.items !== undefined ? { items: dto.items } : {}),
    };
    sections[idx] = updated;

    const compiledText = compileSectionsToMarkdown(sections);
    const nextOutputs: ContentOutputs = {
      ...snapshot.outputs,
      sections,
      text: compiledText,
    };
    const nextUserEdits: ContentUserEdits = {
      ...snapshot.userEdits,
      sections,
      text: compiledText,
    };

    await this.contentRepository.updateEditableState(
      contentId,
      {
        outputs: nextOutputs,
        userEdits: nextUserEdits,
        nodePromptOverrides: snapshot.nodePromptOverrides,
        nodeOutputs: snapshot.nodeOutputs,
        nodeUserEdits: snapshot.nodeUserEdits,
        laneOutputs: (doc as any).laneOutputs,
      },
      auth,
    );

    return {
      success: true,
      section: updated,
      compiledText,
    };
  }

  async regenerateSection(
    contentId: string,
    sectionKey: string,
    dto: RegenerateSectionDto | undefined,
    auth: TenancyAuth,
  ): Promise<{ success: boolean; section: ContentSectionItem; compiledText: string }> {
    const doc = await this.contentRepository.findById(contentId, auth);
    if (!doc) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }

    const snapshot = this.resolveEditableState(doc);
    let sections: ContentSectionItem[] = [
      ...(((snapshot.outputs as any)?.sections ||
        (snapshot.userEdits as any)?.sections ||
        []) as ContentSectionItem[]),
    ];

    if (!sections.length && typeof snapshot.outputs?.text === 'string' && snapshot.outputs.text.trim()) {
      sections = parseMarkdownToSections(snapshot.outputs.text);
    }

    const idx = sections.findIndex((s) => s.key === sectionKey);
    if (idx === -1) {
      throw new NotFoundException(`Section "${sectionKey}" not found in content ${contentId}`);
    }

    const targetSection = sections[idx];
    const rule = await this.rules.findById(doc.ruleRef, auth);
    if (!rule) {
      throw new NotFoundException(`Rule ${doc.ruleRef} not found`);
    }

    let regeneratedContent = targetSection.content || '';
    let regeneratedItems = targetSection.items ? [...targetSection.items] : undefined;

    if (this.textGeneration) {
      const sectionPrompt = [
        `You are regenerating ONLY the single section "${targetSection.title || sectionKey}".`,
        `Section type: ${targetSection.kind}.`,
        dto?.userInstruction ? `User specific instructions for this section: ${dto.userInstruction}` : '',
        `Current section content: ${targetSection.content || (targetSection.items?.join(', ') ?? '')}`,
        targetSection.kind === 'bullet_list' || targetSection.kind === 'numbered_list'
          ? 'Return only bullet points (one per line, starting with • or -).'
          : targetSection.kind === 'hashtags'
            ? 'Return only space-separated hashtags starting with #.'
            : 'Return only the content for this section, without meta labels or quotes.',
      ].filter(Boolean).join('\n\n');

      const genResult = await this.textGeneration.generateText({
        rule: rule as any,
        contentPrompt: sectionPrompt,
        config: {},
      });

      const raw = genResult.text.trim();
      if (targetSection.kind === 'bullet_list' || targetSection.kind === 'numbered_list') {
        const lines = raw.split('\n').map((l) => l.replace(/^[-*•✨👉🔥✅🛒📢🏎️\d\.\)]\s*/, '').trim()).filter(Boolean);
        regeneratedItems = lines.length > 0 ? lines : [raw];
        regeneratedContent = lines.map((l) => `• ${l}`).join('\n');
      } else if (targetSection.kind === 'hashtags') {
        const tags = raw.match(/#\w+/g) || raw.split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`);
        regeneratedItems = tags;
        regeneratedContent = tags.join(' ');
      } else {
        regeneratedContent = raw;
      }
    } else {
      regeneratedContent = `[Regenerated] ${targetSection.content || targetSection.title}`;
    }

    const updated: ContentSectionItem = {
      ...targetSection,
      content: regeneratedContent,
      ...(regeneratedItems ? { items: regeneratedItems } : {}),
    };
    sections[idx] = updated;

    const compiledText = compileSectionsToMarkdown(sections);
    const nextOutputs: ContentOutputs = {
      ...snapshot.outputs,
      sections,
      text: compiledText,
    };
    const nextUserEdits: ContentUserEdits = {
      ...snapshot.userEdits,
      sections,
      text: compiledText,
    };

    await this.contentRepository.updateEditableState(
      contentId,
      {
        outputs: nextOutputs,
        userEdits: nextUserEdits,
        nodePromptOverrides: snapshot.nodePromptOverrides,
        nodeOutputs: snapshot.nodeOutputs,
        nodeUserEdits: snapshot.nodeUserEdits,
        laneOutputs: (doc as any).laneOutputs,
      },
      auth,
    );

    return {
      success: true,
      section: updated,
      compiledText,
    };
  }
}
