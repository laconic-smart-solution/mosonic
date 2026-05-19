import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { mergeResolvedOutputs } from '../content/content-output.utils';
import {
  Content,
  ContentStatus,
  type ContentDocument,
} from '../content/schemas/content.schema';
import { EventsService } from '../events/events.service';
import { LoggingService } from '../logging/logging.service';
import {
  WorkflowNode,
  type WorkflowNodeDocument,
} from '../nodes/schemas/workflow-node.schema';
import type { PipelineContext } from '../nodes/types/node-execution.types';
import { PipelineRepository } from '../pipeline/pipeline.repository';
import { parsePipelineNodeOutputString } from '../pipeline/pipeline-output-parse';
import {
  Pipeline,
  PipelineExecutionMode,
  PipelineNodeExecutionStatus,
  PipelineStatus,
  type PipelineDocument,
} from '../pipeline/schemas/pipeline.schema';
import { Rule, type RuleDocument } from '../rule/schemas/rule.schema';
import {
  Workflow,
  type WorkflowDocument,
} from '../workflow/schemas/workflow.schema';
import { UploadService } from '../upload/upload.service';
import { PipelineBudgetExceededError } from '../cost/pipeline-budget-exceeded.error';
import { NodeExecutor } from './node-executor.service';
import { DependencyResolverService } from './dependency-resolver.service';
import {
  GraphMaterializationService,
  buildPipelineNodeLayoutMap,
  mergeWorkflowLaneIntoConfig,
} from './graph-materialization.service';
import { resolveExecutionRule } from './pipeline-execution-rule.util';
import { CampaignAutonomyService } from '../campaign/campaign-autonomy.service';
import { OutboundWebhookService } from '../integrations/outbound-webhook.service';
import { GraphReplanService } from './graph-replan.service';
import { RuleOverlayBuilderService } from './rule-overlay-builder.service';
import { buildApprovalStateFromPolicy } from '../content/content-approval.util';
import { countNodesByLane } from './lane-pause.util';
import { buildLinearEdgesFromOrder } from '../workflow/workflow-graph.util';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type {
  NodeExecutorInput,
} from '../nodes/types/node-execution.types';

@Injectable()
export class OrchestrationService {
  private readonly logger = new Logger(OrchestrationService.name);
  private readonly useQueue: boolean;

  constructor(
    config: ConfigService,
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
    @InjectModel(Content.name)
    private readonly contentModel: Model<ContentDocument>,
    private readonly nodeExecutor: NodeExecutor,
    private readonly events: EventsService,
    private readonly uploadService: UploadService,
    private readonly pipelineRepo: PipelineRepository,
    private readonly graphMaterialization: GraphMaterializationService,
    private readonly ruleOverlayBuilder: RuleOverlayBuilderService,
    @Inject(forwardRef(() => DependencyResolverService))
    private readonly resolver: DependencyResolverService,
    private readonly loggingService: LoggingService,
    private readonly graphReplan: GraphReplanService,
    private readonly campaignAutonomy: CampaignAutonomyService,
    private readonly outboundWebhooks: OutboundWebhookService,
  ) {
    this.useQueue =
      config.get<string>('ORCHESTRATION_USE_QUEUE', 'false').toLowerCase() ===
      'true';
  }

  async startPipeline(input: {
    workflowId: string;
    ruleId: string;
    contentPrompt: string;
    useLearnings?: boolean;
    metadata?: { source?: 'manual' | 'scheduler' | 'integration'; scheduleId?: string };
    auth: TenancyAuth;
  }): Promise<{ pipelineId: string }> {
    const contentPrompt = input.contentPrompt.trim();
    if (!contentPrompt) {
      throw new BadRequestException('contentPrompt must not be empty');
    }

    const workflow = await this.workflowModel
      .findOne(mergeUserIdFilter({ workflowId: input.workflowId }, input.auth))
      .exec();
    if (!workflow) {
      throw new NotFoundException(`Workflow ${input.workflowId} not found`);
    }
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId: input.ruleId }, input.auth))
      .exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${input.ruleId} not found`);
    }
    const nodes = await this.workflowNodeModel
      .find(
        mergeUserIdFilter({ workflowRef: workflow.workflowId }, input.auth),
      )
      .sort({ order: 1 })
      .exec();
    if (nodes.length === 0) {
      throw new BadRequestException('Workflow has no nodes to execute');
    }

    const templateEdges =
      (workflow.edges ?? []).length > 0
        ? (workflow.edges ?? []).map((e) => ({ from: e.from, to: e.to }))
        : buildLinearEdgesFromOrder(
            nodes.map((n) => ({ nodeId: n.nodeId, order: n.order })),
          );

    const materialized = this.graphMaterialization.materialize(
      nodes.map((node) => ({
        nodeId: node.nodeId,
        type: node.type,
        order: node.order,
        isLocked: node.isLocked,
        userPrompt: node.userPrompt,
        config: mergeWorkflowLaneIntoConfig(
          (node.config ?? {}) as Record<string, unknown>,
          node.lane,
        ),
      })),
      templateEdges,
      rule.toObject(),
      workflow.version ?? 1,
    );

    const templateLayout = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      const x = n.x;
      const y = n.y;
      if (
        typeof x === 'number' &&
        Number.isFinite(x) &&
        typeof y === 'number' &&
        Number.isFinite(y)
      ) {
        templateLayout.set(n.nodeId, { x, y });
      }
    }
    const pipelineLayout = buildPipelineNodeLayoutMap(
      materialized.nodes,
      templateLayout,
    );

    const executableNodes = materialized.nodes.filter(
      (n) => n.type !== WorkflowNodeType.Branch,
    );

    const ruleOverlay = await this.ruleOverlayBuilder.buildForPipeline(rule, {
      useLearnings: input.useLearnings === true,
    });

    const branchTemplate = nodes.find((n) => n.type === WorkflowNodeType.Branch);
    const branchMode = (branchTemplate?.config as { mode?: string } | undefined)
      ?.mode;
    const experimentId =
      branchMode === 'ab_test'
        ? `exp_${randomUUID().slice(0, 8)}`
        : undefined;

    const pipeline = await this.pipelineModel.create({
      userId: input.auth.userId,
      workflowRef: workflow.workflowId,
      ruleRef: rule.ruleId,
      contentPrompt,
      graph: {
        edges: materialized.edges,
        lanes: materialized.lanes,
        materializedFromWorkflowVersion: workflow.version ?? 1,
        layout: pipelineLayout,
      },
      nodes: executableNodes.map((node) => ({
        nodeId: node.nodeId,
        type: node.type,
        order: node.order,
        isLocked: node.isLocked,
        userPrompt: node.userPrompt ?? '',
        config: node.config ?? {},
        lane: node.lane,
        variantId: node.variantId ?? null,
        lastError: null,
        externalJobId: null,
        status: PipelineNodeExecutionStatus.Pending,
        input: '',
        output: null,
        retryCount: 0,
        executedAt: null,
      })),
      status: PipelineStatus.Running,
      startedAt: new Date(),
      completedAt: null,
      pausedNodeId: null,
      pausedLaneId: null,
      executionMode: this.useQueue
        ? PipelineExecutionMode.Queue
        : PipelineExecutionMode.Inline,
      ruleOverlay,
      metadata: {
        source: input.metadata?.source ?? 'manual',
        scheduleId: input.metadata?.scheduleId,
        experimentId,
      },
    });

    const pipelineId = pipeline.pipelineId;
    const totalNodes = executableNodes.length;

    if (this.useQueue) {
      this.events.emitToPipeline(pipelineId, 'pipeline:started', {
        pipelineId,
        totalNodes,
      });
      try {
        await this.resolver.enqueueReadyNodes(pipelineId);
      } catch (err) {
        this.logger.error(
          `Failed to enqueue pipeline ${pipelineId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Failed, {
          completedAt: new Date(),
        });
        this.events.emitToPipeline(pipelineId, 'pipeline:failed', {
          pipelineId,
          message: 'Could not start pipeline queue. Is Redis running?',
        });
        throw err;
      }
      return { pipelineId };
    }

    void this.runPipelineAsync({
      pipelineId,
      workflowId: workflow.workflowId,
      ruleId: rule.ruleId,
      nodes,
      rule,
      contentPrompt,
      userId: input.auth.userId,
    }).catch(async (err: unknown) => {
      if (err instanceof PipelineBudgetExceededError) {
        return;
      }
      await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Failed, {
        completedAt: new Date(),
      });
      this.events.emitToPipeline(pipelineId, 'pipeline:failed', {
        pipelineId,
        message: 'An unexpected error occurred. Please try again.',
      });
    });
    return { pipelineId };
  }

  async retryNode(
    pipelineId: string,
    nodeId: string,
    auth: TenancyAuth,
  ): Promise<void> {
    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

    if (pipeline.executionMode === PipelineExecutionMode.Queue) {
      if (pipeline.status !== PipelineStatus.Paused) {
        throw new BadRequestException('Pipeline is not paused');
      }
      if (pipeline.pausedNodeId && pipeline.pausedNodeId !== nodeId) {
        throw new BadRequestException(
          'Retry the paused node that failed before continuing',
        );
      }
      await this.pipelineRepo.resetNodeToPending(pipelineId, nodeId);
      await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Running, {
        pausedNodeId: null,
      });
      await this.resolver.enqueueReadyNodes(pipelineId);
      return;
    }

    const paused = this.pausedPipelines.get(pipelineId);
    if (!paused) {
      throw new BadRequestException('Pipeline is not paused');
    }
    this.pausedPipelines.delete(pipelineId);
    paused.resolve();
  }

  async skipNode(
    pipelineId: string,
    nodeId: string,
    auth: TenancyAuth,
  ): Promise<void> {
    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    if (pipeline.executionMode !== PipelineExecutionMode.Queue) {
      throw new BadRequestException('Skip is only supported for queue pipelines');
    }
    if (pipeline.status !== PipelineStatus.Paused) {
      throw new BadRequestException('Pipeline is not paused');
    }

    const node = this.pipelineRepo.getNode(pipeline, nodeId);
    if (!node) {
      throw new NotFoundException(`Node ${nodeId} not found in pipeline`);
    }

    await this.pipelineRepo.markNodeSkipped(pipelineId, nodeId);
    await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Running, {
      pausedNodeId: null,
    });
    await this.resolver.onNodeCompleted(pipelineId, nodeId);
    await this.resolver.maybeFinalize(pipelineId);
  }

  async finalizePipeline(pipelineId: string): Promise<void> {
    const pipeline = await this.pipelineRepo.findById(pipelineId);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    if (pipeline.status === PipelineStatus.Completed) {
      return;
    }

    const rule = await this.ruleModel.findOne({ ruleId: pipeline.ruleRef }).exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${pipeline.ruleRef} not found`);
    }

    const context = this.buildContextFromPipeline(pipeline, rule);
    const experimentId = pipeline.metadata?.experimentId ?? null;
    const variantIds = this.collectAbVariantIds(pipeline);
    const targets =
      variantIds.length > 1
        ? variantIds
        : [variantIds[0] ?? null];

    try {
      let primaryContentId = '';
      let primaryUploadId = '';
      for (const variantId of targets) {
        const { contentId, uploadId } = await this.finalizeVariantArtifact({
          pipeline,
          rule,
          context,
          variantId,
          experimentId,
        });
        if (!primaryContentId) {
          primaryContentId = contentId;
          primaryUploadId = uploadId;
        }
      }

      if (!primaryContentId.trim()) {
        throw new Error('No content artifact created for pipeline');
      }

      await this.pipelineRepo.setPipelineStatus(
        pipelineId,
        PipelineStatus.Completed,
        {
          completedAt: new Date(),
          pausedNodeId: null,
          pausedLaneId: null,
        },
      );

      this.events.emitToPipeline(pipelineId, 'pipeline:completed', {
        pipelineId,
        contentId: primaryContentId,
        uploadId: primaryUploadId,
      });

      if (pipeline.userId) {
        void this.outboundWebhooks.emit(pipeline.userId, 'pipeline.completed', {
          pipelineId,
          contentId: primaryContentId,
          uploadId: primaryUploadId,
        });
      }

      const pipelineFresh = await this.pipelineRepo.findById(pipelineId);
      if (pipelineFresh) {
        void this.campaignAutonomy.evaluateAfterPipelineCompleted({
          pipeline: pipelineFresh,
          contentId: primaryContentId,
          uploadId: primaryUploadId,
        });
      }
    } catch (error) {
      this.logger.error(
        `Pipeline finalization failed for ${pipelineId}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Failed, {
        pausedNodeId: null,
        pausedLaneId: null,
      });
      const message =
        error instanceof Error
          ? error.message
          : 'Pipeline finalization failed';
      this.events.emitToPipeline(pipelineId, 'pipeline:failed', {
        pipelineId,
        message,
      });
    }
  }

  private collectAbVariantIds(pipeline: PipelineDocument): string[] {
    const ids = new Set<string>();
    for (const node of pipeline.nodes ?? []) {
      if (node.variantId && node.variantId !== 'control') {
        ids.add(node.variantId);
      }
    }
    return [...ids];
  }

  private async finalizeVariantArtifact(args: {
    pipeline: PipelineDocument;
    rule: RuleDocument;
    context: PipelineContext;
    variantId: string | null;
    experimentId: string | null;
  }): Promise<{ contentId: string; uploadId: string }> {
    const pipelineForVariant = this.filterPipelineForVariant(
      args.pipeline,
      args.variantId,
    );
    const contentId = await this.createContent({
      pipelineId: args.pipeline.pipelineId,
      workflowId: args.pipeline.workflowRef,
      ruleId: args.pipeline.ruleRef,
      context: args.context,
      userId: args.pipeline.userId ?? '',
      pipeline: pipelineForVariant,
      variantId: args.variantId,
      experimentId: args.experimentId,
    });

    const contentDoc = await this.contentModel.findOne({ contentId }).exec();
    if (!contentDoc) {
      throw new Error(`Content ${contentId} missing after pipeline completion`);
    }
    const resolvedOutputs = mergeResolvedOutputs({
      outputs: contentDoc.outputs ?? {},
      userEdits: contentDoc.userEdits ?? {},
    });
    const channels = this.uploadService
      .buildChannelEntriesFromPipeline(
        args.rule.channels ?? [],
        pipelineForVariant,
        resolvedOutputs,
      )
      .filter((ch) => ch.included);
    const { uploadId } = await this.uploadService.createUpload({
      userId: args.pipeline.userId ?? '',
      contentRef: contentId,
      workflowRef: args.pipeline.workflowRef,
      ruleRef: args.pipeline.ruleRef,
      resolvedOutputs,
      ruleChannels: args.rule.channels ?? [],
      channels,
    });
    return { contentId, uploadId };
  }

  private filterPipelineForVariant(
    pipeline: PipelineDocument,
    variantId: string | null,
  ): PipelineDocument {
    if (!variantId) {
      return pipeline;
    }
    const plain =
      typeof pipeline.toObject === 'function'
        ? pipeline.toObject()
        : pipeline;
    const nodes = (plain.nodes ?? []).filter(
      (n) => !n.variantId || n.variantId === variantId,
    );
    return { ...plain, nodes } as PipelineDocument;
  }

  async replanPipeline(
    pipelineId: string,
    operations: Parameters<GraphReplanService['replan']>[1],
    auth: TenancyAuth,
  ) {
    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    return this.graphReplan.replan(pipelineId, operations);
  }

  private async resolvePipelineArtifacts(
    pipelineId: string,
    auth: TenancyAuth,
  ): Promise<{ contentId?: string; uploadId?: string }> {
    const content = await this.contentModel
      .findOne(mergeUserIdFilter({ pipelineRef: pipelineId }, auth))
      .sort({ createdAt: -1 })
      .select({ contentId: 1 })
      .lean()
      .exec();
    if (!content?.contentId) {
      return {};
    }
    let uploadId: string | undefined;
    try {
      const upload = await this.uploadService.findUploadIdByContentRef(
        content.contentId,
        auth,
      );
      uploadId = upload.uploadId;
    } catch {
      uploadId = undefined;
    }
    return { contentId: content.contentId, uploadId };
  }

  async tryFinalizePipeline(
    pipelineId: string,
    auth: TenancyAuth,
  ): ReturnType<OrchestrationService['getPipeline']> {
    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    if (pipeline.status === PipelineStatus.Completed) {
      return this.getPipeline(pipelineId, auth);
    }
    if (pipeline.status !== PipelineStatus.Running) {
      throw new BadRequestException(
        `Cannot finalize pipeline with status ${pipeline.status}`,
      );
    }
    const hasPendingOrRunning = (pipeline.nodes ?? []).some(
      (n) =>
        n.status === PipelineNodeExecutionStatus.Pending ||
        n.status === PipelineNodeExecutionStatus.Running,
    );
    if (hasPendingOrRunning) {
      throw new BadRequestException(
        'Pipeline still has pending or running nodes',
      );
    }
    if (!this.pipelineRepo.allNodesTerminal(pipeline)) {
      throw new BadRequestException('Not all nodes have finished');
    }
    await this.resolver.maybeFinalize(pipelineId);
    return this.getPipeline(pipelineId, auth);
  }

  async getPipeline(
    pipelineId: string,
    auth: TenancyAuth,
  ): Promise<{
    pipeline: {
      pipelineId: string;
      workflowRef: string;
      ruleRef: string;
      contentPrompt: string;
      status: string;
      pausedNodeId: string | null;
      pausedLaneId: string | null;
      startedAt: Date;
      completedAt: Date | null;
      contentId?: string;
      uploadId?: string;
    };
    graph: {
      edges: Array<{ from: string; to: string }>;
      lanes: string[];
      layout?: Record<string, { x: number; y: number }>;
    };
    nodes: Array<{
      nodeId: string;
      type: string;
      order: number;
      isLocked: boolean;
      userPrompt: string;
      config: Record<string, unknown>;
      lane: string | null;
      status: string;
      output: Record<string, unknown> | null;
      retryCount: number;
      executedAt: Date | null;
    }>;
  }> {
    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .lean()
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    const artifacts =
      pipeline.status === PipelineStatus.Completed
        ? await this.resolvePipelineArtifacts(pipelineId, auth)
        : {};
    return {
      pipeline: {
        pipelineId: pipeline.pipelineId,
        workflowRef: pipeline.workflowRef,
        ruleRef: pipeline.ruleRef,
        contentPrompt: pipeline.contentPrompt,
        status: pipeline.status,
        pausedNodeId: pipeline.pausedNodeId ?? null,
        pausedLaneId: pipeline.pausedLaneId ?? null,
        startedAt: pipeline.startedAt,
        completedAt: pipeline.completedAt,
        ...artifacts,
      },
      graph: {
        edges: (pipeline.graph?.edges ?? []).map((e) => ({
          from: e.from,
          to: e.to,
        })),
        lanes: pipeline.graph?.lanes ?? [],
        layout:
          (pipeline.graph?.layout as
            | Record<string, { x: number; y: number }>
            | undefined) ?? {},
      },
      nodes: (pipeline.nodes ?? []).map((node) => ({
        nodeId: node.nodeId,
        type: node.type,
        order: node.order,
        isLocked: node.isLocked,
        userPrompt: node.userPrompt ?? '',
        config: node.config ?? {},
        lane: node.lane ?? null,
        status: node.status,
        output: parsePipelineNodeOutputString(node.output),
        retryCount: node.retryCount,
        executedAt: node.executedAt,
      })),
    };
  }

  async cancelPipeline(
    pipelineId: string,
    auth: TenancyAuth,
  ): Promise<{ success: boolean }> {
    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    if (
      pipeline.status !== PipelineStatus.Running &&
      pipeline.status !== PipelineStatus.Paused
    ) {
      throw new BadRequestException('Pipeline is not active');
    }
    for (const node of pipeline.nodes ?? []) {
      if (node.status === PipelineNodeExecutionStatus.Pending) {
        await this.pipelineRepo.markNodeSkipped(pipelineId, node.nodeId);
      }
    }
    await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Failed, {
      completedAt: new Date(),
      pausedNodeId: null,
      pausedLaneId: null,
    });
    this.events.emitToPipeline(pipelineId, 'pipeline:failed', {
      pipelineId,
      message: 'Pipeline cancelled',
      reason: 'cancelled',
    });
    return { success: true };
  }

  async resumeLane(
    pipelineId: string,
    laneId: string,
    auth: TenancyAuth,
  ): Promise<{ success: boolean }> {
    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    const normalized = laneId.trim().toLowerCase();
    if (pipeline.pausedLaneId?.trim().toLowerCase() !== normalized) {
      throw new BadRequestException('Lane is not paused');
    }
    await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Running, {
      pausedLaneId: null,
      pausedNodeId: null,
    });
    await this.resolver.enqueueReadyNodes(pipelineId);
    return { success: true };
  }

  async skipLane(
    pipelineId: string,
    laneId: string,
    auth: TenancyAuth,
  ): Promise<{ success: boolean }> {
    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    const normalized = laneId.trim().toLowerCase();
    const laneNodes = (pipeline.nodes ?? []).filter(
      (n) => (n.lane?.trim().toLowerCase() ?? '') === normalized,
    );
    for (const node of laneNodes) {
      if (
        node.status === PipelineNodeExecutionStatus.Pending ||
        node.status === PipelineNodeExecutionStatus.Failed
      ) {
        await this.pipelineRepo.markNodeSkipped(pipelineId, node.nodeId);
        await this.resolver.onNodeCompleted(pipelineId, node.nodeId);
      }
    }
    await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Running, {
      pausedLaneId: null,
      pausedNodeId: null,
    });
    await this.resolver.maybeFinalize(pipelineId);
    return { success: true };
  }

  async getPipelineRunSummary(pipelineId: string, auth: TenancyAuth) {
    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .lean()
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    return {
      pipelineId: pipeline.pipelineId,
      status: pipeline.status,
      materializedNodeCount: pipeline.nodes?.length ?? 0,
      lanes: pipeline.graph?.lanes ?? [],
      completedByLane: countNodesByLane(pipeline as PipelineDocument),
      ruleOverlay: pipeline.ruleOverlay ?? null,
      startedAt: pipeline.startedAt,
      completedAt: pipeline.completedAt,
    };
  }

  async getPipelineTimeline(pipelineId: string, auth: TenancyAuth) {
    const pipeline = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId }, auth))
      .lean()
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    const logs = await this.loggingService.findByPipelineRef(pipelineId);
    return {
      pipeline: {
        pipelineId: pipeline.pipelineId,
        status: pipeline.status,
        pausedLaneId: pipeline.pausedLaneId,
      },
      nodes: (pipeline.nodes ?? []).map((n) => ({
        nodeId: n.nodeId,
        type: n.type,
        lane: n.lane,
        status: n.status,
        executedAt: n.executedAt,
        retryCount: n.retryCount,
      })),
      logs: logs.map((l) => ({
        nodeId: l.nodeId,
        level: l.level,
        status: l.status,
        message: l.message,
        timestamp: l.timestamp,
      })),
    };
  }

  private buildContextFromPipeline(
    pipeline: PipelineDocument,
    rule: RuleDocument,
  ): PipelineContext {
    const mergeNode = (pipeline.nodes ?? []).find(
      (n) => n.type === WorkflowNodeType.Merge,
    );
    const anchorId =
      mergeNode?.nodeId ??
      [...(pipeline.nodes ?? [])].sort((a, b) => b.order - a.order)[0]?.nodeId;
    const previousOutputs = anchorId
      ? this.pipelineRepo.buildAncestorOutputs(pipeline, anchorId)
      : this.pipelineRepo.buildPreviousOutputsUpToOrder(
          pipeline,
          Number.MAX_SAFE_INTEGER,
        );
    return {
      rule: resolveExecutionRule(pipeline, rule),
      contentPrompt: pipeline.contentPrompt,
      previousOutputs,
    };
  }

  /** @deprecated Inline execution when ORCHESTRATION_USE_QUEUE=false */
  private async runPipelineAsync(args: {
    pipelineId: string;
    workflowId: string;
    ruleId: string;
    nodes: WorkflowNodeDocument[];
    rule: RuleDocument;
    contentPrompt: string;
    userId: string;
  }): Promise<void> {
    const { pipelineId, workflowId, ruleId, rule, contentPrompt, userId } = args;
    const orderedNodes = [...args.nodes].sort((a, b) => a.order - b.order);
    const totalNodes = orderedNodes.length;
    this.events.emitToPipeline(pipelineId, 'pipeline:started', {
      pipelineId,
      totalNodes,
    });

    const context: PipelineContext = {
      rule,
      contentPrompt,
      previousOutputs: {},
    };

    for (const node of orderedNodes) {
      await this.executeNodeWithPauseRetry({
        pipelineId,
        totalNodes,
        context,
        node,
        userId,
        ruleId: rule.ruleId,
      });
    }

    await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Completed, {
      completedAt: new Date(),
    });
    const contentId = await this.createContent({
      pipelineId,
      workflowId,
      ruleId,
      context,
      userId,
    });

    const contentDoc = await this.contentModel.findOne({ contentId }).exec();
    if (!contentDoc) {
      throw new Error(`Content ${contentId} missing after pipeline completion`);
    }
    const resolvedOutputs = mergeResolvedOutputs({
      outputs: contentDoc.outputs ?? {},
      userEdits: contentDoc.userEdits ?? {},
    });
    const { uploadId } = await this.uploadService.createUpload({
      userId,
      contentRef: contentId,
      workflowRef: workflowId,
      ruleRef: ruleId,
      resolvedOutputs,
      ruleChannels: rule.channels ?? [],
    });

    this.events.emitToPipeline(pipelineId, 'pipeline:completed', {
      pipelineId,
      contentId,
      uploadId,
    });
  }

  private readonly pausedPipelines = new Map<
    string,
    { resolve: () => void; nodeId: string }
  >();

  private async executeNodeWithPauseRetry(args: {
    pipelineId: string;
    totalNodes: number;
    context: PipelineContext;
    node: WorkflowNodeDocument;
    userId: string;
    ruleId: string;
  }): Promise<void> {
    const { pipelineId, totalNodes, context, node, userId, ruleId } = args;

    for (;;) {
      await this.pipelineRepo.updateNodeStatus(
        pipelineId,
        node.nodeId,
        PipelineNodeExecutionStatus.Running,
      );

      const executorInput: NodeExecutorInput = {
        node: {
          nodeId: node.nodeId,
          type: node.type,
          order: node.order,
          config: node.config ?? {},
          workflowRef: node.workflowRef,
        },
        context,
        pipelineId,
        totalNodes,
        userId,
        ruleId,
      };

      try {
        const result = await this.nodeExecutor.execute(executorInput);
        await this.pipelineRepo.updateNodeStatus(
          pipelineId,
          node.nodeId,
          PipelineNodeExecutionStatus.Completed,
          result.output,
        );
        context.previousOutputs = {
          ...context.previousOutputs,
          ...result.output,
        };
        return;
      } catch (err) {
        if (err instanceof PipelineBudgetExceededError) {
          await this.pipelineRepo.updateNodeStatus(
            pipelineId,
            node.nodeId,
            PipelineNodeExecutionStatus.Failed,
          );
          await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Failed, {
            completedAt: new Date(),
          });
          this.events.emitToPipeline(pipelineId, 'pipeline:failed', {
            pipelineId,
            message: err.message,
            reason: 'budget',
            scope: err.scope,
          });
          throw err;
        }
        await this.pipelineRepo.updateNodeStatus(
          pipelineId,
          node.nodeId,
          PipelineNodeExecutionStatus.Failed,
        );
        await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Paused, {
          pausedNodeId: node.nodeId,
        });
        this.events.emitToPipeline(pipelineId, 'pipeline:paused', {
          pipelineId,
          nodeId: node.nodeId,
          nodeType: node.type,
        });

        await new Promise<void>((resolve) => {
          this.pausedPipelines.set(pipelineId, {
            resolve,
            nodeId: node.nodeId,
          });
        });
        await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Running, {
          pausedNodeId: null,
        });
      }
    }
  }

  private async createContent(args: {
    pipelineId: string;
    workflowId: string;
    ruleId: string;
    context: PipelineContext;
    userId: string;
    pipeline?: PipelineDocument;
    variantId?: string | null;
    experimentId?: string | null;
  }): Promise<string> {
    const pipelineLean =
      args.pipeline ??
      (await this.pipelineModel.findOne({ pipelineId: args.pipelineId }).exec());
    const nodeOutputs: Record<string, Record<string, unknown>> = {};
    const laneOutputs: Record<string, Record<string, unknown>> = {};
    for (const n of pipelineLean?.nodes ?? []) {
      const parsed = parsePipelineNodeOutputString(n.output);
      if (parsed && Object.keys(parsed).length > 0) {
        nodeOutputs[n.nodeId] = parsed;
        if (n.lane && n.type === WorkflowNodeType.Adapt) {
          laneOutputs[n.lane] = parsed;
        }
      }
    }

    const ruleDoc = await this.ruleModel.findOne({ ruleId: args.ruleId }).exec();
    const approvalSteps = (ruleDoc?.approvalPolicy ?? []).map((s) => ({
      role: s.role,
      required: s.required !== false,
    }));

    const content = await this.contentModel.create({
      userId: args.userId,
      pipelineRef: args.pipelineId,
      workflowRef: args.workflowId,
      ruleRef: args.ruleId,
      variantId: args.variantId ?? null,
      experimentId: args.experimentId ?? null,
      approval: buildApprovalStateFromPolicy(approvalSteps),
      outputs: {
        keywords: args.context.previousOutputs.keywords,
        text: args.context.previousOutputs.text,
        image: args.context.previousOutputs.image,
        translatedText: args.context.previousOutputs.translatedText,
        video: args.context.previousOutputs.video,
        transcription: args.context.previousOutputs.transcription,
        summary: args.context.previousOutputs.summary,
      },
      userEdits: {},
      nodePromptOverrides: {},
      nodeOutputs,
      nodeUserEdits: {},
      laneOutputs,
      status: ContentStatus.Draft,
    });
    return content.contentId;
  }
}
