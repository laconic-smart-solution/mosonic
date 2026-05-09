import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { ResolvedContentOutputs } from '../content/content-output.utils';
import { McpService } from '../mcp/mcp.service';
import type { ChannelEntry } from '../rule/schemas/rule.schema';
import {
  Upload,
  UploadChannelStatus,
  UploadJobStatus,
  type UploadChannelEntry,
  type UploadDocument,
} from './schemas/upload.schema';

export type CreateUploadParams = {
  contentRef: string;
  workflowRef: string;
  ruleRef: string;
  resolvedOutputs: ResolvedContentOutputs;
  ruleChannels: ChannelEntry[];
};

export type UploadChannelDto = {
  channel: string;
  status: UploadChannelStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  failureReason: string | null;
};

export type UploadDetailDto = {
  uploadId: string;
  contentRef: string;
  status: UploadJobStatus;
  channels: UploadChannelDto[];
  resolvedOutputs: ResolvedContentOutputs;
};

export type PublishUploadResult =
  | { ok: true; skipped: true; message: string }
  | { ok: true; skipped: false; mcpResult: unknown };

const FAILURE_REASON_MAX = 500;

@Injectable()
export class UploadService {
  constructor(
    @InjectModel(Upload.name)
    private readonly uploadModel: Model<UploadDocument>,
    private readonly mcpService: McpService,
  ) {}

  async createUpload(
    params: CreateUploadParams,
  ): Promise<{ uploadId: string }> {
    const channels: UploadChannelEntry[] = params.ruleChannels.map((c) => ({
      channel: c.channel,
      status: UploadChannelStatus.Pending,
      scheduledAt: null,
      publishedAt: null,
      retryCount: 0,
      failureReason: null,
    }));

    const doc = await this.uploadModel.create({
      contentRef: params.contentRef,
      workflowRef: params.workflowRef,
      ruleRef: params.ruleRef,
      hasScheduled: false,
      nextScheduledAt: null,
      channels,
      status: UploadJobStatus.Pending,
      resolvedOutputs: params.resolvedOutputs,
    });

    return { uploadId: doc.uploadId };
  }

  async findByUploadId(uploadId: string): Promise<UploadDetailDto> {
    const doc = await this.uploadModel.findOne({ uploadId }).exec();
    if (!doc) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
    return this.toDetailDto(doc);
  }

  async publishUpload(uploadId: string): Promise<PublishUploadResult> {
    const doc = await this.uploadModel.findOne({ uploadId }).exec();
    if (!doc) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }

    const targets = doc.channels.filter(
      (c) =>
        c.status === UploadChannelStatus.Pending ||
        c.status === UploadChannelStatus.Failed,
    );

    if (targets.length === 0) {
      return {
        ok: true,
        skipped: true,
        message: 'No pending or failed channels to publish',
      };
    }

    const caption = this.buildCaption(doc.resolvedOutputs);
    const ro = doc.resolvedOutputs ?? {};
    const channelNames = targets.map((c) => c.channel);
    const targetSet = new Set(channelNames);

    try {
      const mcpResult = await this.mcpService.publishContent({
        channels: channelNames,
        content: caption,
        imageUrl: ro.image,
        videoUrl: ro.video,
      });

      const now = new Date();
      for (const ch of doc.channels) {
        if (targetSet.has(ch.channel)) {
          ch.status = UploadChannelStatus.Published;
          ch.publishedAt = now;
          ch.failureReason = null;
        }
      }
      doc.status = this.recomputeJobStatus(doc.channels);
      await doc.save();

      return {
        ok: true,
        skipped: false,
        mcpResult: this.toJsonSafe(mcpResult),
      };
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Publish failed';
      const truncated =
        msg.length > FAILURE_REASON_MAX
          ? `${msg.slice(0, FAILURE_REASON_MAX)}…`
          : msg;

      for (const ch of doc.channels) {
        if (targetSet.has(ch.channel)) {
          ch.status = UploadChannelStatus.Failed;
          ch.failureReason = truncated;
        }
      }
      doc.status = this.recomputeJobStatus(doc.channels);
      await doc.save();

      throw new BadRequestException(truncated);
    }
  }

  private toDetailDto(doc: UploadDocument): UploadDetailDto {
    return {
      uploadId: doc.uploadId,
      contentRef: doc.contentRef,
      status: doc.status,
      channels: doc.channels.map((c) => ({
        channel: c.channel,
        status: c.status,
        scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
        publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
        failureReason: c.failureReason,
      })),
      resolvedOutputs: {
        text: doc.resolvedOutputs?.text,
        image: doc.resolvedOutputs?.image,
        translatedText: doc.resolvedOutputs?.translatedText,
        video: doc.resolvedOutputs?.video,
        transcription: doc.resolvedOutputs?.transcription,
        summary: doc.resolvedOutputs?.summary,
      },
    };
  }

  private buildCaption(resolved?: ResolvedContentOutputs): string {
    const r = resolved ?? {};
    for (const s of [r.text, r.translatedText, r.summary]) {
      const t = s?.trim();
      if (t) return t;
    }
    throw new BadRequestException('No caption text in resolved outputs');
  }

  private recomputeJobStatus(channels: UploadChannelEntry[]): UploadJobStatus {
    let published = 0;
    let failed = 0;
    let pending = 0;
    for (const c of channels) {
      if (c.status === UploadChannelStatus.Published) published++;
      else if (c.status === UploadChannelStatus.Failed) failed++;
      else pending++;
    }
    const n = channels.length;
    if (n === 0) return UploadJobStatus.Pending;
    if (published === n) return UploadJobStatus.Completed;
    if (pending === n) return UploadJobStatus.Pending;
    if (failed === n) return UploadJobStatus.Failed;
    return UploadJobStatus.Partial;
  }

  private toJsonSafe(value: unknown): unknown {
    try {
      return JSON.parse(JSON.stringify(value)) as unknown;
    } catch {
      return { message: String(value) };
    }
  }
}
