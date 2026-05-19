import type { NodeJobPayload } from './node-job.payload';
import type { NormalizedVideoConfig } from '../../nodes/services/video-generation.service';

export interface MediaCheckJobPayload extends NodeJobPayload {
  externalJobId: string;
  checkCount: number;
  submittedAt: string;
  normalized: NormalizedVideoConfig;
}
