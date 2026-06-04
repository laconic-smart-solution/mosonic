import type { UploadStatusSummaryDto } from './dto/upload-status.dto';
import {
  UploadChannelStatus,
  UploadJobStatus,
  type UploadChannelEntry,
} from './schemas/upload.schema';

export function recomputeUploadJobStatus(
  channels: UploadChannelEntry[],
): UploadJobStatus {
  let published = 0;
  let failed = 0;
  let pending = 0;
  let running = 0;
  let scheduled = 0;
  let skipped = 0;
  for (const c of channels) {
    if (c.status === UploadChannelStatus.Published) published++;
    else if (c.status === UploadChannelStatus.Failed) failed++;
    else if (c.status === UploadChannelStatus.Publishing) running++;
    else if (c.status === UploadChannelStatus.Scheduled) scheduled++;
    else if (c.status === UploadChannelStatus.Skipped) skipped++;
    else pending++;
  }
  const n = channels.length;
  if (n === 0) return UploadJobStatus.Pending;
  if (running > 0) return UploadJobStatus.Running;
  if (scheduled > 0) return UploadJobStatus.Partial;
  if (published + skipped === n) return UploadJobStatus.Completed;
  if (published === n) return UploadJobStatus.Completed;
  if (pending === n) return UploadJobStatus.Pending;
  if (failed === n) return UploadJobStatus.Failed;
  return UploadJobStatus.Partial;
}

export function buildUploadStatusSummary(
  channels: UploadChannelEntry[],
): UploadStatusSummaryDto {
  const summary: UploadStatusSummaryDto = {
    total: channels.length,
    publishing: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
    skipped: 0,
  };
  for (const c of channels) {
    if (c.status === UploadChannelStatus.Publishing) summary.publishing += 1;
    else if (c.status === UploadChannelStatus.Scheduled) summary.scheduled += 1;
    else if (c.status === UploadChannelStatus.Published) summary.published += 1;
    else if (c.status === UploadChannelStatus.Failed) summary.failed += 1;
    else if (c.status === UploadChannelStatus.Skipped) summary.skipped += 1;
  }
  return summary;
}
