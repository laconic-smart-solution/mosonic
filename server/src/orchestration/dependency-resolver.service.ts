import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { PipelineRepository } from '../pipeline/pipeline.repository';
import {
  PipelineNodeExecutionStatus,
  PipelineStatus,
  type PipelineDocument,
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
import { QUEUES } from './types/queue.constants';
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

  constructor(
    config: ConfigService,
    private readonly pipelineRepo: PipelineRepository,
    @InjectQueue(PIPELINE_NODES_QUEUE)
    private readonly pipelineNodesQueue: Queue<NodeJobPayload>,
    @InjectQueue(QUEUES.VIDEO_GENERATE)
    private readonly videoGenerateQueue: Queue<NodeJobPayload>,
    @InjectQueue(QUEUES.VIDEO_CHECK)
    private readonly videoCheckQueue: Queue<NodeJobPayload>,
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
    const nodeIds = (pipeline.nodes ?? []).map((n) => n.nodeId);
    const roots = getRoots(nodeIds, edges);

    const toEnqueue: string[] = [];
    const rootCandidates: string[] = [];
    for (const rootId of roots) {
      const node = this.pipelineRepo.getNode(pipeline, rootId);
      if (node?.status === PipelineNodeExecutionStatus.Pending) {
        toEnqueue.push(rootId);
      } else {
        rootCandidates.push(
          `${rootId}(${node?.type ?? '?'}:${node?.status ?? 'missing'})`,
        );
      }
    }

    let scanMode: 'roots' | 'all_pending' = 'roots';
    if (toEnqueue.length === 0) {
      scanMode = 'all_pending';
      for (const node of pipeline.nodes ?? []) {
        if (node.status !== PipelineNodeExecutionStatus.Pending) {
          continue;
        }
        if (
          areAllDependenciesMet(
            node.nodeId,
            pipeline.nodes ?? [],
            edges,
            TERMINAL_STATUSES,
          )
        ) {
          toEnqueue.push(node.nodeId);
        }
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
    if (filtered.length === 0 && scanMode === 'all_pending') {
      const pendingIds = (pipeline.nodes ?? [])
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
        `[pipeline:${pipelineId}] non-pending roots skipped: ${rootCandidates.join(', ')}`,
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
          pipeline.nodes ?? [],
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

    await Promise.all(
      filtered.map((nodeId) => this.enqueueNode(pipeline, nodeId)),
    );
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
    const hasPendingOrRunning = (pipeline.nodes ?? []).some(
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

  private getEdges(pipeline: PipelineDocument): WorkflowGraphEdge[] {
    if (!this.useGraph) {
      return buildLinearEdgesFromOrder(
        (pipeline.nodes ?? []).map((n) => ({
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

  private formatNodeSnapshot(pipeline: PipelineDocument): string {
    return (pipeline.nodes ?? [])
      .map((n) => `${n.nodeId.slice(0, 8)}…:${n.type}:${n.status}`)
      .join(' | ');
  }

  private describeNode(
    pipeline: PipelineDocument,
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
    pipeline: PipelineDocument,
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

    const totalNodes = pipeline.nodes?.length ?? 0;
    const payload: NodeJobPayload = {
      pipelineId: pipeline.pipelineId,
      workflowId: pipeline.workflowRef,
      ruleId: pipeline.ruleRef,
      userId: pipeline.userId ?? '',
      nodeId: node.nodeId,
      nodeType: node.type,
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
