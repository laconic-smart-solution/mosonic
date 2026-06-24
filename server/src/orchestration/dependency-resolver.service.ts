import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import type { PipelineRecord, PipelineNodeExecution } from '../domain/pipeline/pipeline.types';
import { parsePipelineNodes } from '../repositories/prisma/pipeline-nodes.util';
import { WorkflowNodeType, type WorkflowNodeConfig } from '../nodes/schemas/workflow-node.schema';
import {
  getVideoGenerationMode,
  normalizeVideoConfig,
} from '../nodes/services/video-generation.service';
import type { IPipelineRepository } from '../pipeline/pipeline.repository';
import { PIPELINE_REPOSITORY } from '../pipeline/pipeline.repository';
import {
  PipelineNodeExecutionStatus,
  PipelineStatus,
} from '../pipeline/schemas/pipeline.schema';
import {
  areAllDependenciesMet,
  buildLinearEdgesFromOrder,
  getIncoming,
  getOutgoing,
  getRoots,
  type WorkflowGraphEdge,
} from '../workflow/workflow-graph.util';
import { isNodeBlockedByLanePause } from './lane-pause.util';
import { OrchestrationService } from './orchestration.service';
import { QUEUES, videoCheckJobId } from './types/queue.constants';
import type { MediaCheckJobPayload } from './types/media-check-job.payload';
import {
  type NodeJobPayload,
  PIPELINE_NODES_QUEUE,
  PIPELINE_NODES_VIDEO_QUEUE,
  pipelineJobIdPrefix,
  pipelineNodeJobId,
} from './types/node-job.payload';

const TERMINAL_STATUSES = new Set<string>([
  PipelineNodeExecutionStatus.Completed,
  PipelineNodeExecutionStatus.Skipped,
]);

@Injectable()
export class DependencyResolverService {
  private readonly logger = new Logger(DependencyResolverService.name);
  private readonly useGraph: boolean;
  private readonly laneScopedPause: boolean;
  private readonly reconcileEnabled: boolean;
  private readonly reconcileBatch: number;
  private reconcileRunning = false;

  constructor(
    config: ConfigService,
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelineRepo: IPipelineRepository,
    @InjectQueue(PIPELINE_NODES_QUEUE)
    private readonly pipelineNodesQueue: Queue<NodeJobPayload>,
    @InjectQueue(QUEUES.VIDEO_GENERATE)
    private readonly videoGenerateQueue: Queue<NodeJobPayload>,
    @InjectQueue(QUEUES.VIDEO_CHECK)
    private readonly videoCheckQueue: Queue<MediaCheckJobPayload>,
    @InjectQueue(PIPELINE_NODES_VIDEO_QUEUE)
    private readonly legacyPipelineVideoQueue: Queue<NodeJobPayload>,
    @Inject(forwardRef(() => OrchestrationService))
    private readonly orchestration: OrchestrationService,
  ) {
    this.useGraph =
      config.get<string>('ORCHESTRATION_USE_GRAPH', 'true').toLowerCase() !==
      'false';
    this.laneScopedPause =
      config.get<string>('LANE_SCOPED_PAUSE', 'false').toLowerCase() ===
      'true';
    this.reconcileEnabled =
      config
        .get<string>('PIPELINE_RECONCILE_ENABLED', 'true')
        .toLowerCase() !== 'false';
    this.reconcileBatch = Number(
      config.get('PIPELINE_RECONCILE_BATCH', 200),
    );
  }

  /**
   * Safety net for stalled pipelines: a node-completion event can be lost (server
   * restart mid-run, a transient DB/Redis hiccup, an unclean worker shutdown),
   * leaving ready downstream nodes stuck in `pending` with nothing to re-trigger
   * them. This periodically scans running pipelines and re-enqueues any pending
   * node whose dependencies are all satisfied. Enqueue is deduped by jobId, so
   * pipelines that are already progressing normally are untouched.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async reconcileStuckPipelines(): Promise<void> {
    if (!this.reconcileEnabled || this.reconcileRunning) {
      return;
    }
    this.reconcileRunning = true;
    try {
      const where = {
        status: PipelineStatus.Running,
      } as unknown as Prisma.PipelineWhereInput;
      const { rows } = await this.pipelineRepo.findPage(
        where,
        1,
        this.reconcileBatch,
        'startedAt',
        'asc',
      );
      let reconciled = 0;
      let videoRecovered = 0;
      for (const pipeline of rows) {
        if (this.hasReadyPendingNode(pipeline)) {
          reconciled += 1;
          this.logger.warn(
            `[pipeline:${pipeline.pipelineId}] reconcile detected ready pending node(s) — re-enqueueing`,
          );
          await this.enqueueReadyNodes(pipeline.pipelineId);
        }
        videoRecovered += await this.reconcileOrphanedVideoChecks(pipeline);
      }
      if (reconciled > 0 || videoRecovered > 0) {
        this.logger.log(
          `reconcileStuckPipelines pending=${reconciled} videoPoll=${videoRecovered} ` +
            `of ${rows.length} running pipeline(s)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `reconcileStuckPipelines failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.reconcileRunning = false;
    }
  }

  /**
   * True when the pipeline has at least one pending node whose dependencies are
   * all terminal and that is not blocked by a lane pause — i.e. a node that
   * should be queued but may have been orphaned.
   */
  private hasReadyPendingNode(pipeline: PipelineRecord): boolean {
    const edges = this.getEdges(pipeline);
    const nodes = parsePipelineNodes(pipeline.nodes);
    return nodes.some(
      (node) =>
        node.status === PipelineNodeExecutionStatus.Pending &&
        areAllDependenciesMet(node.nodeId, nodes, edges, TERMINAL_STATUSES) &&
        !isNodeBlockedByLanePause(pipeline, node.nodeId, this.laneScopedPause),
    );
  }

  /**
   * Re-schedule status polls when a video node is `running` with an external job id
   * but no waiting/delayed/active check job exists (lost delayed job after Redis
   * ECONNRESET, server restart, etc.).
   */
  private async reconcileOrphanedVideoChecks(
    pipeline: PipelineRecord,
  ): Promise<number> {
    const nodes = parsePipelineNodes(pipeline.nodes);
    let recovered = 0;
    for (const node of nodes) {
      if (
        node.type !== WorkflowNodeType.VideoGeneration ||
        node.status !== PipelineNodeExecutionStatus.Running ||
        !node.externalJobId?.trim()
      ) {
        continue;
      }
      if (await this.hasActiveVideoCheckJob(pipeline.pipelineId, node.nodeId)) {
        continue;
      }
      recovered += 1;
      await this.scheduleRecoveredVideoCheck(pipeline, node);
    }
    return recovered;
  }

  private async hasActiveVideoCheckJob(
    pipelineId: string,
    nodeId: string,
  ): Promise<boolean> {
    const prefix = `${pipelineId}__${nodeId}__check__`;
    const states = ['waiting', 'delayed', 'active'] as const;
    for (const state of states) {
      const jobs = await this.videoCheckQueue.getJobs([state]);
      if (jobs.some((job) => job.id?.startsWith(prefix))) {
        return true;
      }
    }
    return false;
  }

  private async scheduleRecoveredVideoCheck(
    pipeline: PipelineRecord,
    node: PipelineNodeExecution,
  ): Promise<void> {
    const allNodes = parsePipelineNodes(pipeline.nodes);
    const config = (node.config ?? {}) as WorkflowNodeConfig;
    const isPresenter = getVideoGenerationMode(config) === 'presenter';
    const videoProvider = isPresenter ? 'heygen' : 'sora';
    const payload: MediaCheckJobPayload = {
      pipelineId: pipeline.pipelineId,
      workflowId: pipeline.workflowRef,
      ruleId: pipeline.ruleRef,
      userId: pipeline.userId ?? '',
      nodeId: node.nodeId,
      nodeType: WorkflowNodeType.VideoGeneration,
      order: node.order,
      totalNodes: allNodes.length,
      contentPrompt: pipeline.contentPrompt,
      lane: node.lane ?? null,
      externalJobId: node.externalJobId!.trim(),
      checkCount: 0,
      submittedAt: new Date().toISOString(),
      videoProvider,
      normalized: isPresenter ? undefined : normalizeVideoConfig(config),
    };
    const jobId = videoCheckJobId(pipeline.pipelineId, node.nodeId, 0);
    const existing = await this.videoCheckQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'delayed' || state === 'active') {
        return;
      }
      await existing.remove();
    }
    await this.videoCheckQueue.add('video_check', payload, {
      jobId,
      delay: 0,
      attempts: 2,
    });
    this.logger.warn(
      `[pipeline:${pipeline.pipelineId}] recovered orphaned video poll node=${node.nodeId} ` +
        `externalJobId=${node.externalJobId}`,
    );
  }

  async enqueueReadyNodes(pipelineId: string): Promise<void> {
    const pipeline = await this.pipelineRepo.findById(pipelineId);
    if (!pipeline) {
      this.logger.warn(`enqueueReadyNodes: pipeline ${pipelineId} not found`);
      return;
    }
    if (pipeline.status !== PipelineStatus.Running) {
      this.logger.log(
        `[pipeline:${pipelineId}] enqueueReadyNodes skipped — pipeline status=${pipeline.status}`,
      );
      return;
    }

    const edges = this.getEdges(pipeline);
    const nodes = parsePipelineNodes(pipeline.nodes);
    const nodeIds = nodes.map((n) => n.nodeId);
    const roots = getRoots(nodeIds, edges);

    const toEnqueue: string[] = [];
    const rootCandidates: string[] = [];
    for (const rootId of roots) {
      const node = this.pipelineRepo.getNode(pipeline, rootId);
      if (node?.status === PipelineNodeExecutionStatus.Pending) {
        rootCandidates.push(
          `${rootId}(${node?.type ?? '?'}:pending-root)`,
        );
      } else {
        rootCandidates.push(
          `${rootId}(${node?.type ?? '?'}:${node?.status ?? 'missing'})`,
        );
      }
    }

    // Always scan every pending node with satisfied dependencies. A roots-only
    // fast path left parallel branch lanes stuck when another pending root existed.
    const scanMode = 'all_pending' as const;
    for (const node of nodes) {
      if (node.status !== PipelineNodeExecutionStatus.Pending) {
        continue;
      }
      if (
        areAllDependenciesMet(node.nodeId, nodes, edges, TERMINAL_STATUSES)
      ) {
        toEnqueue.push(node.nodeId);
      }
    }

    const laneBlocked = toEnqueue.filter((nodeId) =>
      isNodeBlockedByLanePause(pipeline, nodeId, this.laneScopedPause),
    );
    const filtered = toEnqueue.filter(
      (nodeId) =>
        !isNodeBlockedByLanePause(pipeline, nodeId, this.laneScopedPause),
    );

    this.logger.log(
      `[pipeline:${pipelineId}] enqueueReadyNodes scan=${scanMode} ` +
        `useGraph=${this.useGraph} edgeCount=${edges.length} roots=[${roots.join(', ')}] ` +
        `candidates=${toEnqueue.length} enqueue=${filtered.length} ` +
        `laneBlocked=${laneBlocked.length} ` +
        `snapshot=${this.formatNodeSnapshot(pipeline)}`,
    );
    if (toEnqueue.length > 0 && filtered.length === 0) {
      this.logger.warn(
        `[pipeline:${pipelineId}] ready nodes blocked by lane pause (pausedLaneId=${pipeline.pausedLaneId ?? 'none'})`,
      );
    }
    if (filtered.length === 0) {
      const pendingIds = nodes
        .filter((n) => n.status === PipelineNodeExecutionStatus.Pending)
        .map((n) => n.nodeId);
      if (pendingIds.length > 0) {
        this.logger.warn(
          `[pipeline:${pipelineId}] ${pendingIds.length} pending node(s) but none ready — ` +
            `check graph edges: ${this.formatEdges(edges)}`,
        );
      }
    }
    if (rootCandidates.length > 0) {
      this.logger.debug(
        `[pipeline:${pipelineId}] graph roots: ${rootCandidates.join(', ')}`,
      );
    }

    await Promise.all(
      filtered.map((nodeId) => this.enqueueNode(pipeline, nodeId)),
    );
  }

  async onNodeCompleted(
    pipelineId: string,
    completedNodeId: string,
  ): Promise<void> {
    const pipeline = await this.pipelineRepo.findById(pipelineId);
    if (!pipeline) {
      this.logger.warn(
        `[pipeline:${pipelineId}] onNodeCompleted(${completedNodeId}) — pipeline not found`,
      );
      return;
    }
    if (pipeline.status !== PipelineStatus.Running) {
      this.logger.log(
        `[pipeline:${pipelineId}] onNodeCompleted(${completedNodeId}) skipped — status=${pipeline.status}`,
      );
      return;
    }

    const nodes = parsePipelineNodes(pipeline.nodes);
    const completedNode = this.pipelineRepo.getNode(pipeline, completedNodeId);
    const edges = this.getEdges(pipeline);
    const outbound = getOutgoing(edges, completedNodeId);
    const toEnqueue: string[] = [];
    const skippedTargets: string[] = [];

    for (const edge of outbound) {
      const target = this.pipelineRepo.getNode(pipeline, edge.to);
      if (!target) {
        skippedTargets.push(`${edge.to}(missing)`);
        continue;
      }
      if (target.status !== PipelineNodeExecutionStatus.Pending) {
        skippedTargets.push(`${edge.to}(${target.type}:${target.status})`);
        continue;
      }
      if (
        areAllDependenciesMet(
          edge.to,
          nodes,
          edges,
          TERMINAL_STATUSES,
        )
      ) {
        toEnqueue.push(edge.to);
      } else {
        const unmet = getIncoming(edges, edge.to)
          .map((inEdge) => {
            const dep = this.pipelineRepo.getNode(pipeline, inEdge.from);
            return `${inEdge.from}:${dep?.status ?? 'missing'}`;
          })
          .join(', ');
        skippedTargets.push(`${edge.to}(deps unmet: ${unmet})`);
      }
    }

    const laneBlocked = toEnqueue.filter((nodeId) =>
      isNodeBlockedByLanePause(pipeline, nodeId, this.laneScopedPause),
    );
    const filtered = toEnqueue.filter(
      (nodeId) =>
        !isNodeBlockedByLanePause(pipeline, nodeId, this.laneScopedPause),
    );

    this.logger.log(
      `[pipeline:${pipelineId}] onNodeCompleted ${completedNodeId}(${completedNode?.type ?? '?'}) ` +
        `outbound=${outbound.length} enqueue=${filtered.length} ` +
        `targets=[${filtered.map((id) => this.describeNode(pipeline, id)).join(', ')}]`,
    );
    if (outbound.length === 0) {
      this.logger.warn(
        `[pipeline:${pipelineId}] completed node has no outgoing edges — ` +
          `pending may stall; edges=${this.formatEdges(edges)}`,
      );
    }
    if (skippedTargets.length > 0) {
      this.logger.debug(
        `[pipeline:${pipelineId}] outbound skipped: ${skippedTargets.join('; ')}`,
      );
    }
    if (laneBlocked.length > 0) {
      this.logger.warn(
        `[pipeline:${pipelineId}] lane-blocked after complete: ${laneBlocked.join(', ')}`,
      );
    }

    // Full-graph scan catches parallel lanes missed by direct-outbound enqueue only.
    await this.enqueueReadyNodes(pipelineId);
  }

  /**
   * Finalize after queue workers finish a job (not from onNodeCompleted — the
   * current BullMQ job is still "active" while run() is in flight).
   */
  async maybeFinalize(pipelineId: string): Promise<void> {
    const pipeline = await this.pipelineRepo.findById(pipelineId);
    if (!pipeline || pipeline.status !== PipelineStatus.Running) {
      return;
    }
    const nodes = parsePipelineNodes(pipeline.nodes);
    const hasPendingOrRunning = nodes.some(
      (n) =>
        n.status === PipelineNodeExecutionStatus.Pending ||
        n.status === PipelineNodeExecutionStatus.Running,
    );
    if (hasPendingOrRunning) {
      return;
    }
    if (!this.pipelineRepo.allNodesTerminal(pipeline)) {
      this.logger.debug(
        `[pipeline:${pipelineId}] maybeFinalize skipped — not all nodes terminal`,
      );
      return;
    }

    const queuedJobs = await this.countQueuedJobsForPipeline(pipelineId);
    if (queuedJobs > 0) {
      this.logger.log(
        `[pipeline:${pipelineId}] maybeFinalize deferred — ${queuedJobs} queued job(s)`,
      );
      return;
    }

    this.logger.log(
      `[pipeline:${pipelineId}] maybeFinalize → finalizePipeline snapshot=${this.formatNodeSnapshot(pipeline)}`,
    );
    await this.orchestration.finalizePipeline(pipelineId);
  }

  private getEdges(pipeline: PipelineRecord): WorkflowGraphEdge[] {
    if (!this.useGraph) {
      return buildLinearEdgesFromOrder(
        parsePipelineNodes(pipeline.nodes).map((n) => ({
          nodeId: n.nodeId,
          order: n.order,
        })),
      );
    }
    return this.pipelineRepo.getEdgesForPipeline(pipeline);
  }

  /**
   * Only waiting/delayed jobs block finalization. Active jobs are ignored because
   * maybeFinalize runs from inside the worker's process() while that job is still active.
   */
  async removeQueuedJobsForPipeline(pipelineId: string): Promise<void> {
    const prefix = pipelineJobIdPrefix(pipelineId);
    const queues = [
      this.pipelineNodesQueue,
      this.videoGenerateQueue,
      this.videoCheckQueue,
      this.legacyPipelineVideoQueue,
    ];
    for (const queue of queues) {
      const [waiting, delayed] = await Promise.all([
        queue.getJobs(['waiting']),
        queue.getJobs(['delayed']),
      ]);
      for (const job of [...waiting, ...delayed]) {
        if (
          job.id?.startsWith(prefix) ||
          (job.data &&
            'pipelineId' in job.data &&
            (job.data as NodeJobPayload).pipelineId === pipelineId)
        ) {
          await job.remove();
        }
      }
    }
  }

  private async countQueuedJobsForPipeline(pipelineId: string): Promise<number> {
    const prefix = pipelineJobIdPrefix(pipelineId);
    let count = 0;
    const queues = [
      this.pipelineNodesQueue,
      this.videoGenerateQueue,
      this.videoCheckQueue,
      this.legacyPipelineVideoQueue,
    ];
    for (const queue of queues) {
      const [waiting, delayed] = await Promise.all([
        queue.getJobs(['waiting']),
        queue.getJobs(['delayed']),
      ]);
      for (const job of [...waiting, ...delayed]) {
        if (
          job.id?.startsWith(prefix) ||
          (job.data &&
            'pipelineId' in job.data &&
            (job.data as NodeJobPayload).pipelineId === pipelineId)
        ) {
          count += 1;
        }
      }
    }
    return count;
  }

  private formatNodeSnapshot(pipeline: PipelineRecord): string {
    return parsePipelineNodes(pipeline.nodes)
      .map((n) => `${n.nodeId.slice(0, 8)}…:${n.type}:${n.status}`)
      .join(' | ');
  }

  private describeNode(
    pipeline: PipelineRecord,
    nodeId: string,
  ): string {
    const node = this.pipelineRepo.getNode(pipeline, nodeId);
    if (!node) {
      return `${nodeId}(missing)`;
    }
    const lane = node.lane ? `@${node.lane}` : '';
    return `${nodeId}(${node.type}${lane})`;
  }

  private formatEdges(edges: WorkflowGraphEdge[]): string {
    if (edges.length === 0) {
      return '(none)';
    }
    return edges.map((e) => `${e.from}->${e.to}`).join(', ');
  }

  private async enqueueNode(
    pipeline: PipelineRecord,
    nodeId: string,
  ): Promise<void> {
    const node = this.pipelineRepo.getNode(pipeline, nodeId);
    if (!node || node.status !== PipelineNodeExecutionStatus.Pending) {
      this.logger.debug(
        `[pipeline:${pipeline.pipelineId}] enqueueNode skip ${nodeId} — ` +
          `status=${node?.status ?? 'missing'}`,
      );
      return;
    }

    const totalNodes = parsePipelineNodes(pipeline.nodes).length;
    const payload: NodeJobPayload = {
      pipelineId: pipeline.pipelineId,
      workflowId: pipeline.workflowRef,
      ruleId: pipeline.ruleRef,
      userId: pipeline.userId ?? '',
      nodeId: node.nodeId,
      nodeType: node.type as unknown as WorkflowNodeType,
      order: node.order,
      totalNodes,
      contentPrompt: pipeline.contentPrompt,
      lane: node.lane ?? null,
    };

    const jobId = pipelineNodeJobId(pipeline.pipelineId, node.nodeId);
    const queue =
      node.type === WorkflowNodeType.VideoGeneration
        ? this.videoGenerateQueue
        : this.pipelineNodesQueue;

    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        this.logger.debug(
          `[pipeline:${pipeline.pipelineId}] enqueueNode skip ${nodeId} — ` +
            `job ${jobId} already ${state}`,
        );
        return;
      }
      await existing.remove();
    }

    await queue.add('run-node', payload, { jobId });
    this.logger.log(
      `[pipeline:${pipeline.pipelineId}] queued ${node.type} node=${nodeId} ` +
        `order=${node.order} jobId=${jobId} queue=${queue.name}`,
    );
  }
}
