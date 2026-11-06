import { ContentStatus } from '@prisma/client';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { DraftNodeView } from '../../content/content-draft-nodes.util';
import { resolveDraftNodeTarget } from '../../content/content-draft-nodes.util';
import type { ContentService } from '../../content/content.service';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool, toolError } from './tool-error.util';
import {
  assertContentEditable,
  previewFromRecord,
  resolveContentForSession,
  showContentPayload,
} from './content-scope.util';

const RERUN_CONTENT_NODE_SCHEMA = z.object({
  nodeId: z
    .string()
    .describe(
      'Generated node id from get_content nodes[], a type word (image or text) when only one exists, or "all" to re-run every text channel.',
    ),
  message: z
    .string()
    .max(2000)
    .optional()
    .describe('The user follow-up for this re-run, in their words. Do not rewrite the post yourself.'),
  mode: z
    .enum(['edit', 'regenerate'])
    .optional()
    .describe('Image tweaks must use edit (keep the current photo). Omit for text.'),
  useBrandLogo: z
    .boolean()
    .optional()
    .describe('True when the user asked to put the brand logo on the image.'),
  contentId: z
    .string()
    .optional()
    .describe('Content id. Omit to use the latest piece on this brand workflow.'),
  workflowId: z.string().optional(),
});

function askPayload(question: string, options: { id: string; label: string }[]): string {
  return JSON.stringify({
    action: 'ask_user',
    type: 'single',
    question,
    options,
  });
}

export function createRerunContentNodeTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  contentService: ContentService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ nodeId, message, mode, useBrandLogo, contentId, workflowId }) =>
      runTool(async () => {
        const trimmed = nodeId.trim();
        if (!trimmed) {
          return toolError('node_not_found', 'nodeId is required.');
        }

        const scoped = await resolveContentForSession(
          workflowService,
          contents,
          ruleId,
          auth,
          { contentId, workflowId },
        );
        if (!scoped.ok) return scoped.observation;
        // A rejected draft can be re-run: it goes back to draft as the new version.
        const reopen =
          String(scoped.content.status) === String(ContentStatus.rejected);
        const locked = reopen
          ? null
          : assertContentEditable(String(scoped.content.status));
        if (locked) return locked;

        const catalog = await contentService.describeDraftNodes(
          scoped.content.contentId,
          auth,
        );
        const resolution = resolveDraftNodeTarget(trimmed, catalog.nodes);
        if (resolution.kind === 'not_found') {
          return toolError(
            'node_not_found',
            `No generated node matching "${trimmed}" on this draft. Call get_content and use a nodes[].nodeId.`,
          );
        }
        if (resolution.kind === 'ask') {
          return askPayload(resolution.question, resolution.options);
        }

        const targets =
          resolution.kind === 'many' ? resolution.nodes : [resolution.node];
        const pending = targets.find((node) => node.pending);
        if (pending) {
          return toolError(
            'rerun_in_progress',
            'That node is already re-running. Wait for it to finish.',
            { nodeId: pending.nodeId },
          );
        }

        if (reopen) {
          await contents.updateStatus(
            scoped.content.contentId,
            ContentStatus.draft,
            auth,
          );
        }

        const followUp = message?.trim() || undefined;
        const logoInMessage = /\blogo\b/i.test(followUp ?? '');
        const scheduled: {
          outputNodeId: string;
          nodeType: string;
        }[] = [];
        for (const target of targets) {
          if (target.type === 'image_generation' && !target.preview) {
            return toolError(
              'no_image',
              'That image node has no picture to edit yet.',
              { nodeId: target.nodeId },
            );
          }
          const image = target.type === 'image_generation';
          const started = await contentService.scheduleRerun(
            scoped.content.contentId,
            {
              nodeId: target.nodeId,
              message: followUp,
              mode: image ? mode ?? 'edit' : undefined,
              useBrandLogo: image
                ? useBrandLogo === true || logoInMessage
                : undefined,
            },
            auth,
          );
          scheduled.push({
            outputNodeId: started.outputNodeId,
            nodeType: started.nodeType,
          });
        }

        // pendingNodeId must be the materialized output id used for _pending + socket events.
        return showContentPayload(previewFromRecord(scoped.content), {
          action: 'content_rerun_started',
          ...(reopen ? { status: ContentStatus.draft, reopened: true } : {}),
          pendingNodeId: scheduled[0]?.outputNodeId ?? null,
          pendingNodeType: scheduled[0]?.nodeType ?? targets[0]?.type ?? null,
          pendingNodeIds: scheduled.map((row) => row.outputNodeId),
        });
      }),
    {
      name: 'rerun_content_node',
      description:
        'Re-run one generated node on this draft using the user follow-up as the prompt: pass the user\'s words as message (nodeId "all" re-runs every text channel). Also works on a rejected draft (it goes back to draft with the new version) - use it when the user asks to regenerate or make a new version of a rejected post. This is the only way to change a generated image or caption (too long, darker, the brand logo on the current photo). Call get_content first and pass the real nodes[].nodeId (image nodes have type image_generation and a real id, not the word "image"). If several channels or images match, this returns ask_user - stop and wait for the button. Image tweaks use mode=edit (keep the current photo); useBrandLogo=true only when they asked for the logo. Do not write the new caption yourself. Do not call update_node_config or start_generation for this. After it finishes (a later turn), save_content with fromNodeId copies the result onto that channel.',
      schema: RERUN_CONTENT_NODE_SCHEMA,
    },
  );
}
