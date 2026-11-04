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

const APPROVE_CONTENT_SCHEMA = z.object({
  contentId: z
    .string()
    .optional()
    .describe('Content id. Omit to approve the latest piece on this brand workflow.'),
  workflowId: z.string().optional(),
});

export function createApproveContentTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  contentService: ContentService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, workflowId }) =>
      runTool(async () => {
        const scoped = await resolveContentForSession(
          workflowService,
          contents,
          ruleId,
          auth,
          { contentId, workflowId },
        );
        if (!scoped.ok) return scoped.observation;

        const result = await contentService.approveContent(
          scoped.content.contentId,
          auth,
        );
        const updated = await contents.findById(scoped.content.contentId, auth);
        return showContentPayload(previewFromRecord(updated ?? scoped.content), {
          action: 'content_approved',
          uploadId: result.uploadId,
        });
      }),
    {
      name: 'approve_content',
      description:
        'Approve this brand workflow draft so it can move to upload. Call ask_user first and wait for yes. Omit contentId to approve the latest piece. Stop after this tool.',
      schema: APPROVE_CONTENT_SCHEMA,
    },
  );
}
