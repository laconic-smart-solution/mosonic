import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { ContentService } from '../../content/content.service';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool } from './tool-error.util';
import {
  previewFromRecord,
  resolveContentForSession,
  showContentPayload,
} from './content-scope.util';

const REJECT_CONTENT_SCHEMA = z.object({
  contentId: z
    .string()
    .optional()
    .describe('Content id. Omit to reject the latest piece on this brand workflow.'),
  workflowId: z.string().optional(),
  reason: z
    .string()
    .max(500)
    .optional()
    .describe("The user's reason for rejecting, in their words, if they gave one."),
});

export function createRejectContentTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  contentService: ContentService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, workflowId, reason }) =>
      runTool(async () => {
        const scoped = await resolveContentForSession(
          workflowService,
          contents,
          ruleId,
          auth,
          { contentId, workflowId },
        );
        if (!scoped.ok) return scoped.observation;

        await contentService.rejectContent(scoped.content.contentId, auth);
        const updated = await contents.findById(scoped.content.contentId, auth);
        return showContentPayload(previewFromRecord(updated ?? scoped.content), {
          action: 'content_rejected',
          ...(reason?.trim() ? { rejectReason: reason.trim() } : {}),
        });
      }),
    {
      name: 'reject_content',
      description:
        'Reject this brand workflow draft. Call ask_user first and wait for yes. Omit contentId to reject the latest piece. Pass the reason the user gave, if any. Stop after this tool. Afterwards the user can ask for a new version (rerun_content_node works on rejected drafts).',
      schema: REJECT_CONTENT_SCHEMA,
    },
  );
}
