import { Injectable, Logger } from '@nestjs/common';
import { parseHeygenCallbackId } from '../nodes/services/heygen-assets.service';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  PipelineNodeExecutionStatus,
  type PipelineDocument,
} from '../pipeline/schemas/pipeline.schema';
import { PipelineRepository } from '../pipeline/pipeline.repository';
import { MediaNodeCompletionService } from './media-node-completion.service';
import { VideoGenerationService } from '../nodes/services/video-generation.service';
import type { NodeJobPayload } from './types/node-job.payload';

@Injectable()
export class HeygenWebhookService {
  private readonly logger = new Logger(HeygenWebhookService.name);

  constructor(
    private readonly pipelineRepo: PipelineRepository,
    private readonly completion: MediaNodeCompletionService,
    private readonly videoService: VideoGenerationService,
  ) {}

  private buildPayload(
    pipeline: PipelineDocument,
    nodeId: string,
  ): NodeJobPayload {
    const node = this.pipelineRepo.getNode(pipeline, nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found on pipeline`);
    }
    return {
      pipelineId: pipeline.pipelineId,
      workflowId: pipeline.workflowRef,
      ruleId: pipeline.ruleRef,
      userId: pipeline.userId ?? '',
      nodeId: node.nodeId,
      nodeType: node.type,
      order: node.order,
      totalNodes: pipeline.nodes?.length ?? 0,
      contentPrompt: pipeline.contentPrompt,
      lane: node.lane ?? null,
    };
  }

  async handlePayload(body: Record<string, unknown>): Promise<{ ok: boolean }> {
    const callbackId =
      (typeof body.callback_id === 'string' && body.callback_id) ||
      (typeof body.data === 'object' &&
        body.data !== null &&
        typeof (body.data as Record<string, unknown>).callback_id === 'string' &&
        (body.data as Record<string, unknown>).callback_id) ||
      '';

    const parsed = parseHeygenCallbackId(String(callbackId));
    if (!parsed) {
      this.logger.warn(`HeyGen webhook: invalid callback_id=${callbackId}`);
      return { ok: false };
    }

    const { pipelineId, nodeId } = parsed;
    const pipeline = await this.pipelineRepo.findById(pipelineId);
    if (!pipeline) {
      this.logger.warn(`HeyGen webhook: pipeline ${pipelineId} not found`);
      return { ok: false };
    }

    const node = this.pipelineRepo.getNode(pipeline, nodeId);
    if (!node || node.type !== WorkflowNodeType.VideoGeneration) {
      this.logger.warn(
        `HeyGen webhook: node ${nodeId} missing or not video on ${pipelineId}`,
      );
      return { ok: false };
    }

    const data =
      typeof body.data === 'object' && body.data !== null
        ? (body.data as Record<string, unknown>)
        : body;

    const videoId =
      (typeof data.video_id === 'string' && data.video_id) ||
      (typeof body.video_id === 'string' && body.video_id) ||
      node.externalJobId ||
      '';

    if (
      node.externalJobId &&
      videoId &&
      node.externalJobId !== videoId
    ) {
      this.logger.warn(
        `HeyGen webhook: video_id mismatch pipeline=${pipelineId} node=${nodeId}`,
      );
      return { ok: false };
    }

    const statusRaw =
      (typeof data.status === 'string' && data.status.toLowerCase()) ||
      (typeof body.status === 'string' && body.status.toLowerCase()) ||
      '';

    const payload = this.buildPayload(pipeline, nodeId);

    if (statusRaw === 'failed' || statusRaw === 'error') {
      const message =
        (typeof data.failure_message === 'string' && data.failure_message) ||
        (typeof data.error === 'string' && data.error) ||
        'HeyGen presenter video failed';
      if (node.status === PipelineNodeExecutionStatus.Running) {
        await this.completion.failVideoNode(payload, new Error(message), {
          videoProvider: 'heygen',
          stage: 'webhook',
        });
      }
      return { ok: true };
    }

    if (
      statusRaw !== 'completed' &&
      statusRaw !== 'complete' &&
      statusRaw !== 'success'
    ) {
      return { ok: true };
    }

    if (node.status === PipelineNodeExecutionStatus.Completed) {
      return { ok: true };
    }

    try {
      const input = await this.completion.buildVideoGenerationInput(payload);
      const completed = await this.videoService.completeHeyGenVideoJob(
        videoId || node.externalJobId || '',
        input,
      );
      await this.completion.completeVideoNode(payload, completed);
      this.logger.log(
        `HeyGen webhook completed pipeline=${pipelineId} node=${nodeId}`,
      );
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err ?? 'Webhook failed'));
      this.logger.error(
        `HeyGen webhook completion error pipeline=${pipelineId}: ${error.message}`,
      );
      if (node.status === PipelineNodeExecutionStatus.Running) {
        await this.completion.failVideoNode(payload, error, {
          videoProvider: 'heygen',
          stage: 'webhook',
        });
      }
    }

    return { ok: true };
  }
}
