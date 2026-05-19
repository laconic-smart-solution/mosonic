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
      return;
    }

    const edges = this.getEdges(pipeline);
    const nodeIds = (pipeline.nodes ?? []).map((n) => n.nodeId);
    const roots = getRoots(nodeIds, edges);

    const toEnqueue: string[] = [];
    for (const rootId of roots) {
      const node = this.pipelineRepo.getNode(pipeline, rootId);
      if (node?.status === PipelineNodeExecutionStatus.Pending) {
        toEnqueue.push(rootId);
      }
    }

    if (toEnqueue.length === 0) {
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

    const filtered = toEnqueue.filter(
      (nodeId) =>
        !isNodeBlockedByLanePause(pipeline, nodeId, this.laneScopedPause),
    );

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
      return;
    }
    if (pipeline.status !== PipelineStatus.Running) {
      return;
    }

    const edges = this.getEdges(pipeline);
    const outbound = getOutgoing(edges, completedNodeId);
    const toEnqueue: string[] = [];

    for (const edge of outbound) {
      const target = this.pipelineRepo.getNode(pipeline, edge.to);
      if (!target || target.status !== PipelineNodeExecutionStatus.Pending) {
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
      }
    }

    const filtered = toEnqueue.filter(
      (nodeId) =>
        !isNodeBlockedByLanePause(pipeline, nodeId, this.laneScopedPause),
    );

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
      return;
    }

    const queuedJobs = await this.countQueuedJobsForPipeline(pipelineId);
    if (queuedJobs > 0) {
      return;
    }

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

  private async enqueueNode(
    pipeline: PipelineDocument,
    nodeId: string,
  ): Promise<void> {
    const node = this.pipelineRepo.getNode(pipeline, nodeId);
    if (!node || node.status !== PipelineNodeExecutionStatus.Pending) {
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
        return;
      }
      await existing.remove();
    }

    await queue.add('run-node', payload, { jobId });
  }
}
