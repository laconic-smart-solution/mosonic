import { tool } from '@langchain/core/tools';
import { ContentStatus } from '@prisma/client';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool, toolOk } from './tool-error.util';
import {
  listContentsForWorkflow,
  previewFromPageItem,
  resolveWorkflowForSession,
} from './content-scope.util';

const LIST_CONTENTS_SCHEMA = z.object({
  workflowId: z
    .string()
    .optional()
    .describe('Workflow to inspect. Omit to use the latest workflow for this brand.'),
  status: z
    .enum([
      ContentStatus.draft,
      ContentStatus.in_review,
      ContentStatus.approved,
      ContentStatus.rejected,
    ])
    .optional()
    .describe('Optional status filter.'),
  page: z.number().int().min(1).max(20).optional().describe('Page (10 per page, default 1) for older drafts on this workflow.'),
});

export function createListContentsTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  auth: TenancyAuth,
) {
  return tool(
    async ({ workflowId, status, page }) =>
      runTool(async () => {
        const scoped = await resolveWorkflowForSession(
          workflowService,
          ruleId,
          auth,
          workflowId,
        );
        if (!scoped.ok) return scoped.observation;

        const rows = await listContentsForWorkflow(
          contents,
          ruleId,
          scoped.workflow.workflowId,
          auth,
          status,
          page ?? 1,
        );
        return toolOk({
          action: 'list_contents',
          workflowId: scoped.workflow.workflowId,
          page: page ?? 1,
          hasMore: rows.length === 10,
          contents: rows.map(previewFromPageItem),
        });
      }),
    {
      name: 'list_contents',
      description:
        'List drafts and approved pieces for this brand workflow only (newest first, 10 per page; pass page for older ones). Never lists other brands. Use this to find content ids. Does not generate anything.',
      schema: LIST_CONTENTS_SCHEMA,
    },
  );
}
