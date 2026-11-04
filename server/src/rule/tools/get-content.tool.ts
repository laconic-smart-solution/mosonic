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

const GET_CONTENT_SCHEMA = z.object({
  contentId: z
    .string()
    .optional()
    .describe('Content id. Omit to use the latest piece on this brand workflow.'),
  pipelineId: z
    .string()
    .optional()
    .describe('If set, load the content produced by this pipeline on this workflow.'),
  workflowId: z
    .string()
    .optional()
    .describe('Workflow to inspect. Omit to use the latest workflow for this brand.'),
});

export function createGetContentTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  contentService: ContentService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, pipelineId, workflowId }) =>
      runTool(async () => {
        const scoped = await resolveContentForSession(
          workflowService,
          contents,
          ruleId,
          auth,
          { contentId, pipelineId, workflowId },
        );
        if (!scoped.ok) return scoped.observation;
        const catalog = await contentService.describeDraftNodes(
          scoped.content.contentId,
          auth,
        );
        return showContentPayload(previewFromRecord(scoped.content), {
          lanes: catalog.lanes,
          nodes: catalog.nodes,
        });
      }),
    {
      name: 'get_content',
      description:
        'Inspect the latest draft on this brand workflow, including every generated node (text per channel, each image). Call it when they ask to see the post, draft, caption or what was generated (omit contentId), and before a re-run to get nodes[].nodeId. If no_content, the pipeline has not finished - use the pipeline tools. Never looks up other brands. Do not rewrite or invent the copy yourself.',
      schema: GET_CONTENT_SCHEMA,
    },
  );
}
