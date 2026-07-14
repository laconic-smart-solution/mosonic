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
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../auth/tenancy.types';
import { UserRole } from '../domain/users/user.types';
import { mergeResolvedOutputs } from '../content/content-output.utils';
import { ContentStatus } from '../content/schemas/content.schema';
import type { ContentOutputs, ContentUserEdits } from '../content/schemas/content.schema';
import { EventsService } from '../events/events.service';
import { ContentService } from '../content/content.service';
import {
  newsContentReadyNotification,
  pipelineCompletedNotification,
  pipelineStartedNotification,
} from '../events/notification.util';
import { LoggingService } from '../logging/logging.service';
import type { WorkflowNodeRecord } from '../domain/workflow/workflow.types';
import type { PipelineRecord } from '../domain/pipeline/pipeline.types';
import type { PipelineContext } from '../nodes/types/node-execution.types';
import type { IPipelineRepository } from '../pipeline/pipeline.repository';
import { PIPELINE_REPOSITORY } from '../pipeline/pipeline.repository';
import { parsePipelineNodeOutputString } from '../pipeline/pipeline-output-parse';
import { filterPipelineForVariant } from '../pipeline/pipeline-variant-filter.util';
import {
  parsePipelineGraph,
  parsePipelineMetadata,
  parsePipelineNodes,
} from '../repositories/prisma/pipeline-nodes.util';
import {
  PipelineDispatchMode,
  PipelineUserExecutionMode,
  PipelineNodeExecutionStatus,
  PipelineStatus,
} from '../pipeline/schemas/pipeline.schema';
import { defaultPipelineName } from '../pipeline/pipeline-name.util';
import type { IContentRepository } from '../repositories/interfaces/content.repository.interface';
import type { IRuleRepository } from '../repositories/interfaces/rule.repository.interface';
import type { IUserPlanRepository } from '../repositories/interfaces/user-plan.repository.interface';
import type { IWorkflowNodeRepository } from '../repositories/interfaces/workflow-node.repository.interface';
import type { IWorkflowRepository } from '../repositories/interfaces/workflow.repository.interface';
import {
  CONTENT_REPOSITORY,
  RULE_REPOSITORY,
  USER_PLAN_REPOSITORY,
  WORKFLOW_NODE_REPOSITORY,
  WORKFLOW_REPOSITORY,
} from '../repositories/tokens';
import { UploadService } from '../upload/upload.service';
import { PipelineBudgetExceededError } from '../cost/pipeline-budget-exceeded.error';
import { NodeCreditPriceService } from '../credit/node-credit-price.service';
import { CreditService } from '../credit/credit.service';
import { CreditCalculationService } from '../credit/credit-calculation.service';
import { isPipelineNodeCreditType } from '../credit/lib/billable-node-credit-types';
import { resolveCreditNodeTypeForPipelineNode } from '../credit/lib/video-credit-node-type.util';
import { InsufficientCreditsException } from '../credit/insufficient-credits.exception';
import { NodeExecutor } from './node-executor.service';
import { DependencyResolverService } from './dependency-resolver.service';
import {
  GraphMaterializationService,
  buildPipelineNodeLayoutMap,
  mergeWorkflowLaneIntoConfig,
} from './graph-materialization.service';
import { resolveExecutionRule } from './pipeline-execution-rule.util';
import { countNodesByLane } from './lane-pause.util';
import { CampaignAutonomyService } from '../campaign/campaign-autonomy.service';
import { OutboundWebhookService } from '../integrations/outbound-webhook.service';
import { GraphReplanService } from './graph-replan.service';
import { PipelineNodeCompletionService } from './pipeline-node-completion.service';
import { validateAndNormalizeReviewNodeIds } from './pipeline-node-review-eligibility.util';
import { PipelineNodeReviewService } from './pipeline-node-review.service';
import { RuleOverlayBuilderService } from './rule-overlay-builder.service';
import { buildApprovalStateFromPolicy } from '../content/content-approval.util';
import { buildLinearEdgesFromOrder, parseWorkflowEdges } from '../workflow/workflow-graph.util';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { WorkflowNodeConfig } from '../nodes/schemas/workflow-node.schema';
import type { NodeExecutorInput } from '../nodes/types/node-execution.types';
import type { Rule } from '../rule/schemas/rule.schema';
import type { ChannelEntry } from '../rule/schemas/rule.schema';
import type { PipelineDocument } from '../pipeline/schemas/pipeline.schema';
import type { RuleRecord } from '../repositories/interfaces/rule.repository.interface';

@Injectable()
export class OrchestrationService {
  private readonly logger = new Logger(OrchestrationService.name);
  private readonly useQueue: boolean;

  constructor(
    config: ConfigService,
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelineRepo: IPipelineRepository,
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflows: IWorkflowRepository,
    @Inject(WORKFLOW_NODE_REPOSITORY)
    private readonly workflowNodes: IWorkflowNodeRepository,
    @Inject(RULE_REPOSITORY)
    private readonly rules: IRuleRepository,
    @Inject(CONTENT_REPOSITORY)
    private readonly contents: IContentRepository,
    @Inject(USER_PLAN_REPOSITORY)
    private readonly userPlans: IUserPlanRepository,
    private readonly nodeCreditPriceService: NodeCreditPriceService,
    private readonly creditService: CreditService,
    private readonly creditCalculation: CreditCalculationService,
    private readonly nodeExecutor: NodeExecutor,
    private readonly events: EventsService,
    private readonly uploadService: UploadService,
    private readonly graphMaterialization: GraphMaterializationService,
    private readonly ruleOverlayBuilder: RuleOverlayBuilderService,
    @Inject(forwardRef(() => DependencyResolverService))
    private readonly resolver: DependencyResolverService,
    private readonly loggingService: LoggingService,
    private readonly graphReplan: GraphReplanService,
    private readonly nodeReview: PipelineNodeReviewService,
    private readonly campaignAutonomy: CampaignAutonomyService,
    private readonly outboundWebhooks: OutboundWebhookService,
    @Inject(forwardRef(() => ContentService))
    private readonly contentService: ContentService,
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
    executionMode?: 'auto' | 'step';
    reviewNodeIds?: string[];
    metadata?: {
      source?: 'manual' | 'scheduler' | 'integration' | 'news';
      scheduleId?: string;
      newsMeta?: {
        title: string;
        url: string;
        sourceId: string;
        publishedAt: string;
        relevanceScore: number;
        suggestedAngle: string;
      };
    };
    auth: TenancyAuth;
  }): Promise<{ pipelineId: string }> {
    const contentPrompt = input.contentPrompt.trim();
    if (!contentPrompt) {
      throw new BadRequestException('contentPrompt must not be empty');
    }

    const workflow = await this.workflows.findById(input.workflowId, input.auth);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${input.workflowId} not found`);
    }
    const rule = await this.rules.findById(input.ruleId, input.auth);
    if (!rule) {
      throw new NotFoundException(`Rule ${input.ruleId} not found`);
    }
    const nodes = await this.workflowNodes.findByWorkflow(
      workflow.workflowId,
      input.auth,
    );
    if (nodes.length === 0) {
      throw new BadRequestException('Workflow has no nodes to execute');
    }

    let normalizedReviewNodeIds: string[] | undefined;
    try {
      normalizedReviewNodeIds = validateAndNormalizeReviewNodeIds({
        executionMode: input.executionMode,
        reviewNodeIds: input.reviewNodeIds,
        workflowNodes: nodes.map((n) => ({
          nodeId: n.nodeId,
          type: n.type,
        })),
      });
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }

    const workflowEdges = parseWorkflowEdges(workflow.edges);
    const templateEdges =
      workflowEdges.length > 0
        ? workflowEdges
        : buildLinearEdgesFromOrder(
            nodes.map((n) => ({ nodeId: n.nodeId, order: n.order })),
          );

    const materialized = this.graphMaterialization.materialize(
      nodes.map((node) => ({
        nodeId: node.nodeId,
        type: node.type as unknown as WorkflowNodeType,
        order: node.order,
        isLocked: node.isLocked,
        userPrompt: node.userPrompt ?? '',
        config: mergeWorkflowLaneIntoConfig(
          (node.config ?? {}) as Record<string, unknown>,
          node.lane,
        ),
      })),
      templateEdges,
      rule as unknown as Rule,
      workflow.version ?? 1,
    );

    const pipelineStoreNodes = materialized.nodes.filter(
      (n) => n.type !== WorkflowNodeType.Branch,
    );

    const billableCreditNodeTypes = this.collectBillableCreditNodeTypes(
      pipelineStoreNodes,
    );

    const { totalCredits, breakdown: creditBreakdown } =
      await this.computeNodeCreditEstimate(billableCreditNodeTypes);
    if (totalCredits > 0) {
      const creditsRemaining = await this.getCreditsRemaining(input.auth.userId);
      if (creditsRemaining < totalCredits) {
        throw new InsufficientCreditsException({
          requiredCredits: totalCredits,
          creditsRemaining,
        });
      }
    }

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
    for (const n of nodes) {
      const pos = templateLayout.get(n.nodeId);
      if (
        pos &&
        (n.type === WorkflowNodeType.Branch ||
          n.type === WorkflowNodeType.Merge)
      ) {
        pipelineLayout[n.nodeId] = { x: pos.x, y: pos.y };
      }
    }

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

    const startedAt = new Date();
    const pipeline = await this.pipelineRepo.create({
      userId: input.auth.userId,
      workflowRef: workflow.workflowId,
      ruleRef: rule.ruleId,
      contentPrompt,
      name: defaultPipelineName(contentPrompt, startedAt),
      graph: {
        edges: materialized.edges,
        lanes: materialized.lanes,
        materializedFromWorkflowVersion: workflow.version ?? 1,
        layout: pipelineLayout,
      } as unknown as Prisma.InputJsonValue,
      nodes: pipelineStoreNodes.map((node) => ({
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
        reviewRegenerateCount: 0,
        executedAt: null,
      })) as Prisma.InputJsonValue,
      status: PipelineStatus.Running,
      startedAt,
      completedAt: null,
      pausedNodeId: null,
      pausedLaneId: null,
      dispatchMode: this.useQueue
        ? PipelineDispatchMode.Queue
        : PipelineDispatchMode.Inline,
      executionMode:
        input.executionMode === 'step'
          ? PipelineUserExecutionMode.Step
          : PipelineUserExecutionMode.Auto,
      ruleOverlay: (ruleOverlay ?? null) as unknown as Prisma.InputJsonValue,
      metadata: {
        source: input.metadata?.source ?? 'manual',
        scheduleId: input.metadata?.scheduleId,
        experimentId,
        newsMeta: input.metadata?.newsMeta ?? null,
        ...(normalizedReviewNodeIds !== undefined
          ? { reviewNodeIds: normalizedReviewNodeIds }
          : {}),
      } as unknown as Prisma.InputJsonValue,
      creditsCharged: totalCredits,
      creditChargeBreakdown: creditBreakdown.map((row) => ({
        nodeType: row.nodeType,
        count: row.count,
        creditsEach: row.creditsEach,
      })),
      creditsReconciled: false,
    });

    const pipelineId = pipeline.pipelineId;
    const totalNodes = pipelineStoreNodes.length;

    if (totalCredits > 0) {
      const config = await this.creditCalculation.getConfig();
      try {
        await this.creditService.chargePipelineRun({
          userId: input.auth.userId,
          pipelineId,
          creditPriceUsd: config.creditPriceUsd,
          items: creditBreakdown.map((row) => ({
            nodeType: row.nodeType,
            count: row.count,
            creditsEach: row.creditsEach,
          })),
        });
      } catch (err) {
        await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Failed, {
          completedAt: new Date(),
        });
        await this.reconcilePipelineCredits(pipelineId);
        throw err;
      }
    }

    this.logger.log(
      `[pipeline:${pipelineId}] started workflow=${workflow.workflowId} ` +
        `mode=${this.useQueue ? 'queue' : 'inline'} nodes=${totalNodes} ` +
        `templateEdges=${templateEdges.length} materializedEdges=${materialized.edges.length} ` +
        `lanes=[${materialized.lanes.join(', ')}] ` +
        `types=[${pipelineStoreNodes.map((n) => n.type).join(' → ')}]`,
    );
    if (materialized.edges.length > 0) {
      this.logger.debug(
        `[pipeline:${pipelineId}] edges: ` +
          materialized.edges.map((e) => `${e.from}->${e.to}`).join(', '),
      );
    }

    if (this.useQueue) {
      this.notifyPipelineStarted(input.auth.userId, {
        pipelineId,
        ruleRef: rule.ruleId,
        workflowRef: workflow.workflowId,
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
        await this.reconcilePipelineCredits(pipelineId);
        this.events.emitToPipeline(pipelineId, 'pipeline:failed', {
          pipelineId,
          message: 'Could not start pipeline queue. Is Redis running?',
        });
        throw err;
      }
      this.events.emitToPipeline(pipelineId, 'pipeline:started', {
        pipelineId,
        totalNodes,
      });
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
      await this.reconcilePipelineCredits(pipelineId);
      this.events.emitToPipeline(pipelineId, 'pipeline:failed', {
        pipelineId,
        message: 'An unexpected error occurred. Please try again.',
      });
    });
    return { pipelineId };
  }

  /** Aggregate per credit-node-type cost for workflow node runs (video mode-aware). */
  private async computeNodeCreditEstimate(nodeTypes: string[]): Promise<{
    totalCredits: number;
    breakdown: Array<{
      nodeType: string;
      count: number;
      creditsEach: number;
      creditsTotal: number;
    }>;
  }> {
    const counts = new Map<string, number>();
    for (const type of nodeTypes) {
      if (isPipelineNodeCreditType(type)) {
        counts.set(type, (counts.get(type) ?? 0) + 1);
      }
    }

    const breakdown: Array<{
      nodeType: string;
      count: number;
      creditsEach: number;
      creditsTotal: number;
    }> = [];
    let totalCredits = 0;

    for (const [nodeType, count] of counts) {
      const creditsEach =
        (await this.nodeCreditPriceService.getActiveCostCredit(nodeType)) ?? 0;
      const creditsTotal = creditsEach * count;
      totalCredits += creditsTotal;
      breakdown.push({ nodeType, count, creditsEach, creditsTotal });
    }

    breakdown.sort((a, b) => a.nodeType.localeCompare(b.nodeType));
    return { totalCredits, breakdown };
  }

  private collectBillableCreditNodeTypes(
    nodes: Array<{ type: string; config?: Record<string, unknown> | null }>,
  ): string[] {
    return nodes
      .filter(
        (n) =>
          n.type !== WorkflowNodeType.Merge &&
          n.type !== WorkflowNodeType.Branch,
      )
      .map((n) =>
        resolveCreditNodeTypeForPipelineNode(
          n.type,
          (n.config ?? undefined) as Record<string, unknown> | undefined,
        ),
      );
  }

  private async getCreditsRemaining(userId: string): Promise<number> {
    const userPlan = await this.userPlans.findActiveByUserId(userId);
    return userPlan?.creditsRemaining ?? 0;
  }

  /**
   * Refund up-front credits for billable nodes that did not complete. Idempotent
   * via the pipeline's `creditsReconciled` flag, so it is safe to call from every
   * terminal transition (success, failure, cancel).
   */
  async reconcilePipelineCredits(pipelineId: string): Promise<void> {
    try {
      const pipeline = await this.pipelineRepo.findById(pipelineId);
      if (!pipeline) return;
      if (pipeline.creditsReconciled) return;
      const charged = pipeline.creditsCharged ?? 0;
      const breakdown = (pipeline.creditChargeBreakdown ?? []) as Array<{
        nodeType: string;
        count: number;
        creditsEach: number;
      }>;
      if (charged <= 0 || breakdown.length === 0) {
        await this.pipelineRepo.markCreditsReconciled(pipelineId);
        return;
      }

      const completedByCreditType = new Map<string, number>();
      for (const node of parsePipelineNodes(pipeline.nodes)) {
        if (node.status !== PipelineNodeExecutionStatus.Completed) continue;
        const creditType = resolveCreditNodeTypeForPipelineNode(
          node.type,
          (node.config ?? undefined) as Record<string, unknown> | undefined,
        );
        if (!isPipelineNodeCreditType(creditType)) continue;
        completedByCreditType.set(
          creditType,
          (completedByCreditType.get(creditType) ?? 0) + 1,
        );
      }

      const refundItems: Array<{ nodeType: string; credits: number }> = [];
      for (const row of breakdown) {
        if (!isPipelineNodeCreditType(row.nodeType)) continue;
        const completed = completedByCreditType.get(row.nodeType) ?? 0;
        const unused = Math.max(0, row.count - completed);
        const credits = unused * row.creditsEach;
        if (credits > 0) {
          refundItems.push({ nodeType: row.nodeType, credits });
        }
      }

      const claimed = await this.pipelineRepo.claimCreditReconciliation(pipelineId);
      if (!claimed) return;

      if (refundItems.length > 0 && pipeline.userId) {
        const config = await this.creditCalculation.getConfig();
        await this.creditService.refundPipelineRun({
          userId: pipeline.userId,
          pipelineId,
          creditPriceUsd: config.creditPriceUsd,
          items: refundItems,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Credit reconciliation failed for ${pipelineId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Pre-run estimate of the credits a workflow will charge plus the user's balance. */
  async estimatePipelineCredits(input: {
    workflowId: string;
    ruleId?: string;
    auth: TenancyAuth;
  }): Promise<{
    totalCredits: number;
    breakdown: Array<{
      nodeType: string;
      count: number;
      creditsEach: number;
      creditsTotal: number;
    }>;
    creditsRemaining: number;
    sufficient: boolean;
  }> {
    const nodeTypes = await this.resolveBillableNodeTypesForEstimate(input);
    const { totalCredits, breakdown } =
      await this.computeNodeCreditEstimate(nodeTypes);
    const creditsRemaining = await this.getCreditsRemaining(input.auth.userId);

    return {
      totalCredits,
      breakdown,
      creditsRemaining,
      sufficient: creditsRemaining >= totalCredits,
    };
  }

  private async resolveBillableNodeTypesForEstimate(input: {
    workflowId: string;
    ruleId?: string;
    auth: TenancyAuth;
  }): Promise<string[]> {
    const workflow = await this.workflows.findById(input.workflowId, input.auth);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${input.workflowId} not found`);
    }

    const nodes = await this.workflowNodes.findByWorkflow(
      workflow.workflowId,
      input.auth,
    );

    if (!input.ruleId) {
      return this.collectBillableCreditNodeTypes(
        nodes.map((n) => ({
          type: n.type,
          config: (n.config ?? undefined) as Record<string, unknown> | undefined,
        })),
      );
    }

    const rule = await this.rules.findById(input.ruleId, input.auth);
    if (!rule) {
      throw new NotFoundException(`Rule ${input.ruleId} not found`);
    }

    const workflowEdges = parseWorkflowEdges(workflow.edges);
    const templateEdges =
      workflowEdges.length > 0
        ? workflowEdges
        : buildLinearEdgesFromOrder(
            nodes.map((n) => ({ nodeId: n.nodeId, order: n.order })),
          );

    const materialized = this.graphMaterialization.materialize(
      nodes.map((node) => ({
        nodeId: node.nodeId,
        type: node.type as unknown as WorkflowNodeType,
        order: node.order,
        isLocked: node.isLocked,
        userPrompt: node.userPrompt ?? '',
        config: mergeWorkflowLaneIntoConfig(
          (node.config ?? {}) as Record<string, unknown>,
          node.lane,
        ),
      })),
      templateEdges,
      rule as unknown as Rule,
      workflow.version ?? 1,
    );

    return this.collectBillableCreditNodeTypes(materialized.nodes);
  }

  async retryNode(
    pipelineId: string,
    nodeId: string,
    auth: TenancyAuth,
  ): Promise<void> {
    const pipeline = await this.pipelineRepo.findById(pipelineId, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

    if (pipeline.dispatchMode === PipelineDispatchMode.Queue) {
      const isPaused = pipeline.status === PipelineStatus.Paused;
      const isLanePaused =
        pipeline.status === PipelineStatus.Running &&
        pipeline.pausedNodeId === nodeId;

      if (!isPaused && !isLanePaused) {
        throw new BadRequestException('Pipeline is not paused');
      }
      if (pipeline.pausedNodeId && pipeline.pausedNodeId !== nodeId) {
        throw new BadRequestException(
          'Retry the paused node that failed before continuing',
        );
      }
      await this.resolver.removeQueuedJobsForNode(pipelineId, nodeId);
      await this.pipelineRepo.resetNodeToPending(pipelineId, nodeId);
      await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Running, {
        pausedNodeId: null,
        pausedLaneId: null,
      });
      await this.resolver.enqueueNodeForUserRetry(pipelineId, nodeId);
      return;
    }

    const paused = this.pausedPipelines.get(pipelineId);
    if (!paused) {
      throw new BadRequestException('Pipeline is not paused');
    }
    this.pausedPipelines.delete(pipelineId);
    paused.resolve();
  }

  async estimateReviewRegenerateCredits(
    pipelineId: string,
    nodeId: string,
    auth: TenancyAuth,
  ): Promise<{
    creditsRequired: number;
    creditsRemaining: number;
    sufficient: boolean;
    creditNodeType: string | null;
  }> {
    const creditsRemaining = await this.getCreditsRemaining(auth.userId);
    const pipeline = await this.pipelineRepo.findById(pipelineId, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }

    const node = this.pipelineRepo.getNode(pipeline, nodeId);
    if (
      !node ||
      node.status !== PipelineNodeExecutionStatus.WaitingReview ||
      node.type === WorkflowNodeType.Merge ||
      node.type === WorkflowNodeType.Branch
    ) {
      return {
        creditsRequired: 0,
        creditsRemaining,
        sufficient: true,
        creditNodeType: null,
      };
    }

    const creditNodeType = resolveCreditNodeTypeForPipelineNode(
      node.type,
      (node.config ?? undefined) as Record<string, unknown> | undefined,
    );
    const creditsRequired =
      (await this.nodeCreditPriceService.getActiveCostCredit(creditNodeType)) ??
      0;

    return {
      creditsRequired,
      creditsRemaining,
      sufficient: creditsRequired <= 0 || creditsRemaining >= creditsRequired,
      creditNodeType,
    };
  }

  async reviewNode(
    pipelineId: string,
    nodeId: string,
    dto: {
      action: 'continue' | 'edit' | 'regenerate';
      editedContent?: string;
      regenerateInstruction?: string;
      mediaUrl?: string;
    },
    auth: TenancyAuth,
  ): Promise<{ success: boolean; noop?: boolean }> {
    if (dto.action === 'regenerate') {
      await this.chargeForPipelineReviewRegenerate({
        pipelineId,
        nodeId,
        auth,
      });
    }

    return this.nodeReview.reviewNode({
      pipelineId,
      nodeId,
      action: dto.action,
      editedContent: dto.editedContent,
      regenerateInstruction: dto.regenerateInstruction,
      mediaUrl: dto.mediaUrl,
      auth,
    });
  }

  private async chargeForPipelineReviewRegenerate(args: {
    pipelineId: string;
    nodeId: string;
    auth: TenancyAuth;
  }): Promise<void> {
    const pipeline = await this.pipelineRepo.findById(
      args.pipelineId,
      args.auth,
    );
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${args.pipelineId} not found`);
    }

    const node = this.pipelineRepo.getNode(pipeline, args.nodeId);
    if (
      !node ||
      node.status !== PipelineNodeExecutionStatus.WaitingReview ||
      node.type === WorkflowNodeType.Merge ||
      node.type === WorkflowNodeType.Branch
    ) {
      return;
    }

    const creditNodeType = resolveCreditNodeTypeForPipelineNode(
      node.type,
      (node.config ?? undefined) as Record<string, unknown> | undefined,
    );
    const creditsEach =
      (await this.nodeCreditPriceService.getActiveCostCredit(creditNodeType)) ??
      0;
    if (creditsEach <= 0) return;

    const creditsRemaining = await this.getCreditsRemaining(args.auth.userId);
    if (creditsRemaining < creditsEach) {
      throw new InsufficientCreditsException({
        requiredCredits: creditsEach,
        creditsRemaining,
      });
    }

    const config = await this.creditCalculation.getConfig();
    await this.creditService.chargeSingleNodeRun({
      userId: args.auth.userId,
      pipelineRef: args.pipelineId,
      contentRef: '',
      nodeId: args.nodeId,
      nodeType: creditNodeType,
      credits: creditsEach,
      creditPriceUsd: config.creditPriceUsd,
    });
  }

  async skipNode(
    pipelineId: string,
    nodeId: string,
    auth: TenancyAuth,
  ): Promise<void> {
    const pipeline = await this.pipelineRepo.findById(pipelineId, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    if (pipeline.dispatchMode !== PipelineDispatchMode.Queue) {
      throw new BadRequestException('Skip is only supported for queue pipelines');
    }
    if (
      pipeline.status !== PipelineStatus.Paused &&
      pipeline.status !== PipelineStatus.Running
    ) {
      throw new BadRequestException('Pipeline is not active');
    }

    const node = this.pipelineRepo.getNode(pipeline, nodeId);
    if (!node) {
      throw new NotFoundException(`Node ${nodeId} not found in pipeline`);
    }
    if (
      node.status === PipelineNodeExecutionStatus.Completed ||
      node.status === PipelineNodeExecutionStatus.Skipped
    ) {
      throw new BadRequestException('Node already finished');
    }

    const isPaused = pipeline.status === PipelineStatus.Paused;
    const canForceSkipWhileRunning =
      pipeline.status === PipelineStatus.Running &&
      (node.status === PipelineNodeExecutionStatus.Running ||
        node.status === PipelineNodeExecutionStatus.Failed);
    const canSkipWhilePaused =
      isPaused &&
      (node.status === PipelineNodeExecutionStatus.Failed ||
        node.status === PipelineNodeExecutionStatus.Running ||
        node.status === PipelineNodeExecutionStatus.WaitingReview ||
        pipeline.pausedNodeId === nodeId);

    if (!canForceSkipWhileRunning && !canSkipWhilePaused) {
      throw new BadRequestException(
        'Node cannot be skipped in its current state',
      );
    }

    await this.resolver.removeQueuedJobsForNode(pipelineId, nodeId);
    if (node.externalJobId) {
      await this.pipelineRepo.clearExternalJobId(pipelineId, nodeId);
    }
    await this.pipelineRepo.markNodeSkipped(pipelineId, nodeId);
    await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Running, {
      pausedNodeId: null,
      pausedLaneId: null,
    });
    await this.resolver.onNodeCompleted(pipelineId, nodeId);
    await this.resolver.maybeFinalize(pipelineId);
  }

  async finalizePipeline(
    pipelineId: string,
  ): Promise<{ contentId: string; uploadId: string } | null> {
    const pipeline = await this.pipelineRepo.findById(pipelineId);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    if (pipeline.status === PipelineStatus.Completed) {
      const auth: TenancyAuth = {
        userId: pipeline.userId ?? '',
        role: UserRole.CUSTOMER,
      };
      const existing = await this.resolvePipelineArtifacts(pipelineId, auth);
      if (existing.contentId && existing.uploadId) {
        return {
          contentId: existing.contentId,
          uploadId: existing.uploadId,
        };
      }
      return null;
    }

    const claimed = await this.pipelineRepo.claimPipelineFinalization(pipelineId);
    if (!claimed) {
      const fresh = await this.pipelineRepo.findById(pipelineId);
      if (fresh?.status === PipelineStatus.Completed) {
        const auth: TenancyAuth = {
          userId: fresh.userId ?? '',
          role: UserRole.CUSTOMER,
        };
        const existing = await this.resolvePipelineArtifacts(pipelineId, auth);
        if (existing.contentId && existing.uploadId) {
          return {
            contentId: existing.contentId,
            uploadId: existing.uploadId,
          };
        }
        return null;
      }
      this.logger.warn(
        `[pipeline:${pipelineId}] finalizePipeline claim failed — status=${fresh?.status ?? 'missing'}`,
      );
      return null;
    }

    const rule = await this.rules.findById(pipeline.ruleRef);
    if (!rule) {
      throw new NotFoundException(`Rule ${pipeline.ruleRef} not found`);
    }

    const metadata = parsePipelineMetadata(pipeline.metadata);
    const experimentId = metadata.experimentId ?? null;
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

      await this.reconcilePipelineCredits(pipelineId);

      this.events.emitToPipeline(pipelineId, 'pipeline:completed', {
        pipelineId,
        contentId: primaryContentId,
        uploadId: primaryUploadId,
      });
      this.notifyPipelineCompleted(pipeline.userId, {
        pipelineId,
        contentId: primaryContentId,
        uploadId: primaryUploadId,
        ruleRef: pipeline.ruleRef,
        workflowRef: pipeline.workflowRef,
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
          pipeline: pipelineFresh as unknown as PipelineDocument,
          contentId: primaryContentId,
          uploadId: primaryUploadId,
        });
        void this.handleNewsPipelineCompleted({
          pipeline: pipelineFresh,
          contentId: primaryContentId,
        });
      }

      return { contentId: primaryContentId, uploadId: primaryUploadId };
    } catch (error) {
      this.logger.error(
        `Pipeline finalization failed for ${pipelineId}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Failed, {
        pausedNodeId: null,
        pausedLaneId: null,
      });
      await this.reconcilePipelineCredits(pipelineId);
      const message =
        error instanceof Error
          ? error.message
          : 'Pipeline finalization failed';
      this.events.emitToPipeline(pipelineId, 'pipeline:failed', {
        pipelineId,
        message,
      });
      return null;
    }
  }

  private collectAbVariantIds(pipeline: PipelineRecord): string[] {
    const ids = new Set<string>();
    for (const node of parsePipelineNodes(pipeline.nodes)) {
      if (node.variantId && node.variantId !== 'control') {
        ids.add(node.variantId);
      }
    }
    return [...ids];
  }

  private async finalizeVariantArtifact(args: {
    pipeline: PipelineRecord;
    rule: RuleRecord;
    variantId: string | null;
    experimentId: string | null;
  }): Promise<{ contentId: string; uploadId: string }> {
    const pipelineForVariant = filterPipelineForVariant(
      args.pipeline,
      args.variantId,
    );
    const pipelineId = args.pipeline.pipelineId;
    const existing = await this.contents.findByPipelineAndVariant(
      pipelineId,
      args.variantId,
    );

    let contentId: string;
    if (existing) {
      contentId = existing.contentId;
    } else {
      const variantContext = this.buildContextFromPipeline(
        pipelineForVariant,
        args.rule,
      );
      contentId = await this.createContent({
        pipelineId,
        workflowId: args.pipeline.workflowRef,
        ruleId: args.pipeline.ruleRef,
        context: variantContext,
        userId: args.pipeline.userId ?? '',
        pipeline: pipelineForVariant,
        variantId: args.variantId,
        experimentId: args.experimentId,
      });
    }

    const contentDoc = await this.contents.findByContentId(contentId);
    if (!contentDoc) {
      throw new Error(`Content ${contentId} missing after pipeline completion`);
    }
    const pipelineNodesOrdered = parsePipelineNodes(pipelineForVariant.nodes).map(
      (n) => ({
        nodeId: n.nodeId,
        type: String(n.type),
        order: n.order,
      }),
    );
    const resolvedOutputs = mergeResolvedOutputs(
      {
        outputs: (contentDoc.outputs ?? {}) as ContentOutputs,
        userEdits: (contentDoc.userEdits ?? {}) as ContentUserEdits,
        nodeOutputs: (contentDoc.nodeOutputs ?? {}) as Record<
          string,
          Record<string, unknown>
        >,
        nodeUserEdits: (contentDoc.nodeUserEdits ?? {}) as Record<
          string,
          Record<string, unknown>
        >,
      },
      pipelineNodesOrdered.length > 0 ? { pipelineNodesOrdered } : undefined,
    );
    const ruleChannels = (args.rule.channels ?? []) as ChannelEntry[];
    const channels = this.uploadService
      .buildChannelEntriesFromPipeline(
        ruleChannels,
        pipelineForVariant as unknown as PipelineDocument,
        resolvedOutputs,
      )
      .filter((ch) => ch.included);

    const uploadAuth: TenancyAuth = {
      userId: args.pipeline.userId ?? '',
      role: UserRole.CUSTOMER,
    };
    const { uploadId } = await this.uploadService.refreshUploadForApprove(
      {
        userId: args.pipeline.userId ?? '',
        contentRef: contentId,
        workflowRef: args.pipeline.workflowRef,
        ruleRef: args.pipeline.ruleRef,
        resolvedOutputs,
        ruleChannels,
        channels,
      },
      uploadAuth,
    );
    return { contentId, uploadId };
  }

  async replanPipeline(
    pipelineId: string,
    operations: Parameters<GraphReplanService['replan']>[1],
    auth: TenancyAuth,
  ) {
    const pipeline = await this.pipelineRepo.findById(pipelineId, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    return this.graphReplan.replan(pipelineId, operations);
  }

  private async resolvePipelineArtifacts(
    pipelineId: string,
    auth: TenancyAuth,
  ): Promise<{ contentId?: string; uploadId?: string }> {
    const content = await this.contents.findLatestByPipeline(pipelineId, auth);
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
    const pipeline = await this.pipelineRepo.findById(pipelineId, auth);
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
    const pipelineNodes = parsePipelineNodes(pipeline.nodes);
    const hasPendingOrRunning = pipelineNodes.some(
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
      name: string;
      contentPrompt: string;
      status: string;
      pausedNodeId: string | null;
      pausedLaneId: string | null;
      executionMode: string;
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
      lastError: string | null;
      retryCount: number;
      reviewRegenerateCount: number;
      executedAt: Date | null;
    }>;
  }> {
    const pipeline = await this.pipelineRepo.findById(pipelineId, auth);
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
        name: pipeline.name?.trim() || defaultPipelineName(pipeline.contentPrompt, pipeline.startedAt),
        contentPrompt: pipeline.contentPrompt,
        status: pipeline.status,
        pausedNodeId: pipeline.pausedNodeId ?? null,
        pausedLaneId: pipeline.pausedLaneId ?? null,
        executionMode: pipeline.executionMode ?? 'auto',
        startedAt: pipeline.startedAt,
        completedAt: pipeline.completedAt,
        ...artifacts,
      },
      graph: (() => {
        const graph = parsePipelineGraph(pipeline.graph);
        return {
          edges: (graph.edges ?? []).map((e) => ({
            from: e.from,
            to: e.to,
            ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
            ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
          })),
          lanes: graph.lanes ?? [],
          layout: graph.layout ?? {},
        };
      })(),
      nodes: parsePipelineNodes(pipeline.nodes).map((node) => ({
        nodeId: node.nodeId,
        type: node.type,
        order: node.order,
        isLocked: node.isLocked,
        userPrompt: node.userPrompt ?? '',
        config: node.config ?? {},
        lane: node.lane ?? null,
        status: node.status,
        output: parsePipelineNodeOutputString(node.output),
        lastError: node.lastError ?? null,
        retryCount: node.retryCount,
        reviewRegenerateCount: node.reviewRegenerateCount ?? 0,
        executedAt: node.executedAt ? new Date(node.executedAt) : null,
      })),
    };
  }

  async cancelPipeline(
    pipelineId: string,
    auth: TenancyAuth,
  ): Promise<{
    success: boolean;
    keptProgress: boolean;
    contentId?: string;
    uploadId?: string;
  }> {
    const pipeline = await this.pipelineRepo.findById(pipelineId, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    if (
      pipeline.status !== PipelineStatus.Running &&
      pipeline.status !== PipelineStatus.Paused
    ) {
      throw new BadRequestException('Pipeline is not active');
    }

    await this.resolver.removeQueuedJobsForPipeline(pipelineId);

    let hasCompleted = false;
    for (const node of parsePipelineNodes(pipeline.nodes)) {
      if (node.status === PipelineNodeExecutionStatus.Completed) {
        hasCompleted = true;
        continue;
      }
      if (node.status === PipelineNodeExecutionStatus.Skipped) {
        continue;
      }
      if (node.externalJobId) {
        await this.pipelineRepo.clearExternalJobId(pipelineId, node.nodeId);
      }
      await this.pipelineRepo.markNodeSkipped(pipelineId, node.nodeId);
    }

    const paused = this.pausedPipelines.get(pipelineId);
    if (paused) {
      this.pausedPipelines.delete(pipelineId);
      paused.resolve();
    }

    if (hasCompleted) {
      await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Running, {
        pausedNodeId: null,
        pausedLaneId: null,
      });
      const finalized = await this.finalizePipeline(pipelineId);
      if (finalized) {
        return {
          success: true,
          keptProgress: true,
          contentId: finalized.contentId,
          uploadId: finalized.uploadId,
        };
      }
      const artifacts = await this.resolvePipelineArtifacts(pipelineId, auth);
      return {
        success: true,
        keptProgress: Boolean(artifacts.contentId),
        contentId: artifacts.contentId,
        uploadId: artifacts.uploadId,
      };
    }

    await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Failed, {
      completedAt: new Date(),
      pausedNodeId: null,
      pausedLaneId: null,
    });

    await this.reconcilePipelineCredits(pipelineId);

    this.events.emitToPipeline(pipelineId, 'pipeline:failed', {
      pipelineId,
      message: 'Pipeline stopped',
      reason: 'cancelled',
    });
    return { success: true, keptProgress: false };
  }

  async resumeLane(
    pipelineId: string,
    laneId: string,
    auth: TenancyAuth,
  ): Promise<{ success: boolean }> {
    const pipeline = await this.pipelineRepo.findById(pipelineId, auth);
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
    const pipeline = await this.pipelineRepo.findById(pipelineId, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    const normalized = laneId.trim().toLowerCase();
    const laneNodes = parsePipelineNodes(pipeline.nodes).filter(
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
    const pipeline = await this.pipelineRepo.findById(pipelineId, auth);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    const graph = parsePipelineGraph(pipeline.graph);
    return {
      pipelineId: pipeline.pipelineId,
      status: pipeline.status,
      materializedNodeCount: parsePipelineNodes(pipeline.nodes).length,
      lanes: graph.lanes ?? [],
      completedByLane: countNodesByLane(pipeline),
      ruleOverlay: pipeline.ruleOverlay ?? null,
      startedAt: pipeline.startedAt,
      completedAt: pipeline.completedAt,
    };
  }

  async getPipelineTimeline(pipelineId: string, auth: TenancyAuth) {
    const pipeline = await this.pipelineRepo.findById(pipelineId, auth);
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
      nodes: parsePipelineNodes(pipeline.nodes).map((n) => ({
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
    pipeline: PipelineRecord,
    rule: RuleRecord,
  ): PipelineContext {
    const nodes = parsePipelineNodes(pipeline.nodes);
    const mergeNode = nodes.find((n) => n.type === WorkflowNodeType.Merge);
    const anchorId =
      mergeNode?.nodeId ??
      [...nodes].sort((a, b) => b.order - a.order)[0]?.nodeId;
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
    nodes: WorkflowNodeRecord[];
    rule: RuleRecord;
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
    this.notifyPipelineStarted(userId, {
      pipelineId,
      ruleRef: rule.ruleId,
      workflowRef: workflowId,
      totalNodes,
    });

    const context: PipelineContext = {
      rule: rule as unknown as Rule,
      contentPrompt,
      previousOutputs: {},
    };

    this.logger.log(
      `[pipeline:${pipelineId}] inline run sequence: ` +
        orderedNodes.map((n) => `${n.nodeId}(${n.type})`).join(' → '),
    );

    for (const node of orderedNodes) {
      const active = await this.pipelineRepo.findById(pipelineId);
      if (!active || active.status !== PipelineStatus.Running) {
        this.logger.warn(
          `[pipeline:${pipelineId}] inline stopped before ${node.nodeId} — status=${active?.status ?? 'missing'}`,
        );
        return;
      }
      this.logger.log(
        `[pipeline:${pipelineId}] inline executing ${node.nodeId} type=${node.type} order=${node.order}`,
      );
      await this.executeNodeWithPauseRetry({
        pipelineId,
        totalNodes,
        context,
        node,
        userId,
        ruleId: rule.ruleId,
      });
    }

    const beforeComplete = await this.pipelineRepo.findById(pipelineId);
    if (!beforeComplete || beforeComplete.status !== PipelineStatus.Running) {
      return;
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

    const contentDoc = await this.contents.findByContentId(contentId);
    if (!contentDoc) {
      throw new Error(`Content ${contentId} missing after pipeline completion`);
    }
    const resolvedOutputs = mergeResolvedOutputs({
      outputs: (contentDoc.outputs ?? {}) as ContentOutputs,
      userEdits: (contentDoc.userEdits ?? {}) as ContentUserEdits,
    });
    const ruleChannels = (rule.channels ?? []) as ChannelEntry[];
    const { uploadId } = await this.uploadService.createUpload({
      userId,
      contentRef: contentId,
      workflowRef: workflowId,
      ruleRef: ruleId,
      resolvedOutputs,
      ruleChannels,
    });

    this.events.emitToPipeline(pipelineId, 'pipeline:completed', {
      pipelineId,
      contentId,
      uploadId,
    });
    this.notifyPipelineCompleted(userId, {
      pipelineId,
      contentId,
      uploadId,
      ruleRef: ruleId,
      workflowRef: workflowId,
    });
  }

  private notifyPipelineStarted(
    userId: string | undefined | null,
    args: {
      pipelineId: string;
      ruleRef?: string;
      workflowRef?: string;
      totalNodes: number;
    },
  ): void {
    const id = userId?.trim();
    if (!id) return;
    const body = pipelineStartedNotification(args);
    this.events.emitUserNotification({
      userId: id,
      sector: 'pipeline',
      type: 'pipeline.started',
      ...body,
    });
  }

  private async handleNewsPipelineCompleted(args: {
    pipeline: PipelineRecord;
    contentId: string;
  }): Promise<void> {
    const metadata = parsePipelineMetadata(args.pipeline.metadata);
    if (metadata.source !== 'news') return;

    const userId = args.pipeline.userId?.trim();
    const newsMeta = metadata.newsMeta;
    if (userId && newsMeta?.title) {
      const body = newsContentReadyNotification({
        pipelineId: args.pipeline.pipelineId,
        contentId: args.contentId,
        ruleRef: args.pipeline.ruleRef,
        newsTitle: newsMeta.title,
        newsUrl: newsMeta.url,
      });
      this.events.emitUserNotification({
        userId,
        sector: 'news',
        type: 'news.content_ready',
        title: body.title,
        message: body.message,
        data: body.data,
        action: body.action,
      });
    }

    if (!userId) return;

    const rule = await this.rules.findById(args.pipeline.ruleRef);
    const newsTrigger = rule?.newsTrigger as { autoApprove?: boolean } | null;
    if (!newsTrigger?.autoApprove) return;

    try {
      await this.contentService.approveContent(args.contentId, {
        userId,
        role: UserRole.CUSTOMER,
      });
    } catch (err) {
      this.logger.warn(
        `News auto-approve failed for content ${args.contentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private notifyPipelineCompleted(
    userId: string | undefined | null,
    args: {
      pipelineId: string;
      contentId: string;
      uploadId?: string;
      ruleRef?: string;
      workflowRef?: string;
    },
  ): void {
    const id = userId?.trim();
    if (!id) return;
    const body = pipelineCompletedNotification(args);
    this.events.emitUserNotification({
      userId: id,
      sector: 'pipeline',
      type: 'pipeline.completed',
      ...body,
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
    node: WorkflowNodeRecord;
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
          type: node.type as unknown as WorkflowNodeType,
          order: node.order,
          config: (node.config ?? {}) as WorkflowNodeConfig,
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
        const afterPause = await this.pipelineRepo.findById(pipelineId);
        if (!afterPause || afterPause.status !== PipelineStatus.Running) {
          return;
        }
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
    pipeline?: PipelineRecord;
    variantId?: string | null;
    experimentId?: string | null;
  }): Promise<string> {
    const pipelineLean =
      args.pipeline ??
      (await this.pipelineRepo.findById(args.pipelineId));
    const nodeOutputs: Record<string, Record<string, unknown>> = {};
    const laneOutputs: Record<string, Record<string, unknown>> = {};
    for (const n of parsePipelineNodes(pipelineLean?.nodes)) {
      const parsed = parsePipelineNodeOutputString(n.output);
      if (parsed && Object.keys(parsed).length > 0) {
        nodeOutputs[n.nodeId] = parsed;
        if (n.lane && n.type === WorkflowNodeType.Adapt) {
          laneOutputs[n.lane] = parsed;
        }
      }
    }

    const ruleDoc = await this.rules.findById(args.ruleId);
    const approvalPolicy = (ruleDoc?.approvalPolicy ?? []) as Array<{
      role: string;
      required?: boolean;
    }>;
    const approvalSteps = approvalPolicy.map((s) => ({
      role: s.role,
      required: s.required !== false,
    }));

    const content = await this.contents.create({
      userId: args.userId,
      pipelineRef: args.pipelineId,
      workflowRef: args.workflowId,
      ruleRef: args.ruleId,
      variantId: args.variantId ?? null,
      experimentId: args.experimentId ?? null,
      approval: buildApprovalStateFromPolicy(approvalSteps) as unknown as Prisma.InputJsonValue,
      outputs: {
        keywords: args.context.previousOutputs.keywords,
        text: args.context.previousOutputs.text,
        image: args.context.previousOutputs.image,
        translatedText: args.context.previousOutputs.translatedText,
        video: args.context.previousOutputs.video,
        transcription: args.context.previousOutputs.transcription,
        summary: args.context.previousOutputs.summary,
      } as unknown as Prisma.InputJsonValue,
      userEdits: {} as Prisma.InputJsonValue,
      nodePromptOverrides: {} as Prisma.InputJsonValue,
      nodeOutputs: nodeOutputs as Prisma.InputJsonValue,
      nodeUserEdits: {} as Prisma.InputJsonValue,
      laneOutputs: laneOutputs as Prisma.InputJsonValue,
      status: ContentStatus.Draft,
    });
    return content.contentId;
  }
}
