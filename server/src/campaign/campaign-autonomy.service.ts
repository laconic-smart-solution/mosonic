import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentService } from '../content/content.service';
import { ContentStatus } from '../content/schemas/content.schema';
import type { ContentApprovalState } from '../content/schemas/content.schema';
import { allRequiredStepsApproved } from '../content/content-approval.util';
import { EventsService } from '../events/events.service';
import { McpService } from '../mcp/mcp.service';
import {
  PipelineNodeExecutionStatus,
  type PipelineDocument,
} from '../pipeline/schemas/pipeline.schema';
import type { ICampaignAutonomyPolicyRepository } from '../repositories/interfaces/campaign-autonomy-policy.repository.interface';
import { CAMPAIGN_AUTONOMY_POLICY_REPOSITORY } from '../repositories/tokens';
import { UploadService } from '../upload/upload.service';
import { UserRole } from '../users/schemas/user.schema';
import { AutonomyMode } from './schemas/campaign-autonomy-policy.schema';

@Injectable()
export class CampaignAutonomyService {
  private readonly logger = new Logger(CampaignAutonomyService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(CAMPAIGN_AUTONOMY_POLICY_REPOSITORY)
    private readonly policies: ICampaignAutonomyPolicyRepository,
    private readonly contentService: ContentService,
    private readonly uploadService: UploadService,
    private readonly mcpService: McpService,
    private readonly events: EventsService,
  ) {}

  async evaluateAfterPipelineCompleted(args: {
    pipeline: PipelineDocument;
    contentId: string;
    uploadId: string;
  }): Promise<void> {
    if (
      this.config.get<string>('CAMPAIGN_AUTONOMY_ENABLED', 'false') !== 'true'
    ) {
      return;
    }
    if (args.pipeline.metadata?.source !== 'scheduler') {
      return;
    }

    const policy = await this.policies.findByRuleRef(args.pipeline.ruleRef);
    if (!policy?.enabled || policy.mode === AutonomyMode.Off) {
      return;
    }

    const blockReason = await this.evaluateBlockReason(
      policy,
      args.pipeline,
      args.contentId,
    );
    if (blockReason) {
      this.events.emitToRule(
        args.pipeline.ruleRef,
        'campaign:autonomous_blocked',
        {
          ruleRef: args.pipeline.ruleRef,
          pipelineId: args.pipeline.pipelineId,
          contentId: args.contentId,
          reason: blockReason,
        },
      );
      return;
    }

    const userId = args.pipeline.userId ?? '';
    const auth = { userId, role: UserRole.CUSTOMER };

    try {
      const content = await this.contentService.getContentForAutonomy(
        args.contentId,
        auth,
      );
      if (content.status !== ContentStatus.Approved) {
        if (
          !allRequiredStepsApproved(
            content.approval as unknown as ContentApprovalState | undefined,
          )
        ) {
          this.emitBlocked(args, 'Approval steps incomplete');
          return;
        }
        await this.contentService.approveContent(args.contentId, auth);
      }

      const upload = await this.uploadService.findByUploadId(
        args.uploadId,
        auth,
      );
      let channels = upload.channels.map((ch) => ({
        channel: ch.channel,
        included:
          policy.allowedChannels.length === 0 ||
          policy.allowedChannels.some(
            (c) => c.toLowerCase() === ch.channel.toLowerCase(),
          ),
      }));
      if (channels.every((c) => !c.included)) {
        channels = upload.channels.map((ch) => ({
          channel: ch.channel,
          included: ch.included,
        }));
      }
      await this.uploadService.publishUpload(
        args.uploadId,
        { publishNow: true, channels },
        auth,
      );

      this.events.emitToRule(
        args.pipeline.ruleRef,
        'campaign:autonomous_published',
        {
          ruleRef: args.pipeline.ruleRef,
          pipelineId: args.pipeline.pipelineId,
          contentId: args.contentId,
          uploadId: args.uploadId,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Autonomy publish failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.emitBlocked(
        args,
        err instanceof Error ? err.message : 'Autonomy publish failed',
      );
    }
  }

  private async evaluateBlockReason(
    policy: {
      quietHours?: unknown;
    },
    pipeline: PipelineDocument,
    contentId: string,
  ): Promise<string | null> {
    const failed = (pipeline.nodes ?? []).some(
      (n) => n.status === PipelineNodeExecutionStatus.Failed,
    );
    if (failed) {
      return 'Pipeline has failed nodes';
    }

    const accounts = await this.mcpService.getConnectedAccounts(
      pipeline.userId ?? '',
    );
    if (!accounts.accounts?.length) {
      return 'No connected publish accounts';
    }

    const textBlob = JSON.stringify(
      await this.contentService.getContentForAutonomy(contentId, {
        userId: pipeline.userId ?? '',
        role: UserRole.CUSTOMER,
      }),
    ).toLowerCase();
    const restricted = ['guaranteed cure', 'get rich quick', 'miracle weight'];
    if (restricted.some((p) => textBlob.includes(p))) {
      return 'Content failed moderation gate';
    }

    const quietHours = policy.quietHours as
      | { start?: string; end?: string }
      | null
      | undefined;
    if (quietHours?.start && quietHours?.end) {
      const now = new Date();
      const hour = now.getUTCHours();
      const start = parseInt(quietHours.start.split(':')[0] ?? '22', 10);
      const end = parseInt(quietHours.end.split(':')[0] ?? '7', 10);
      if (start > end) {
        if (hour >= start || hour < end) {
          return 'Quiet hours';
        }
      } else if (hour >= start && hour < end) {
        return 'Quiet hours';
      }
    }

    return null;
  }

  private emitBlocked(
    args: { pipeline: PipelineDocument; contentId: string },
    reason: string,
  ): void {
    this.events.emitToRule(
      args.pipeline.ruleRef,
      'campaign:autonomous_blocked',
      {
        ruleRef: args.pipeline.ruleRef,
        pipelineId: args.pipeline.pipelineId,
        contentId: args.contentId,
        reason,
      },
    );
  }
}
