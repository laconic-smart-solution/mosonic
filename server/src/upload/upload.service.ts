import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { ResolvedContentOutputs } from '../content/content-output.utils';
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

@Injectable()
export class UploadService {
  constructor(
    @InjectModel(Upload.name)
    private readonly uploadModel: Model<UploadDocument>,
  ) {}

  async createUpload(params: CreateUploadParams): Promise<{ uploadId: string }> {
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
}
