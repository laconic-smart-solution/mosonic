import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { SaveContentDto } from '../../content/dto/save-content.dto';
import { applyNodeOutputToDraft } from '../../content/content-draft-nodes.util';
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

const SAVE_CONTENT_SCHEMA = z.object({
  contentId: z
    .string()
    .optional()
    .describe('Content id. Omit to edit the latest piece on this brand workflow.'),
  workflowId: z.string().optional(),
  fromNodeId: z
    .string()
    .optional()
    .describe(
      'Copy this generated node’s current output onto the draft. Use this after a re-run finishes. Do not pass a caption you wrote.',
    ),
  text: z.string().optional().describe('Manual caption replacement. Do not use this to shorten a post — re-run the node instead.'),
  translatedText: z.string().optional().describe('Replacement translated text.'),
  summary: z.string().optional().describe('Replacement summary.'),
  keywords: z.string().optional().describe('Replacement keywords.'),
});

export function createSaveContentTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  contentService: ContentService,
  auth: TenancyAuth,
) {
  return tool(
    async ({
      contentId,
      workflowId,
      fromNodeId,
      text,
      translatedText,
      summary,
      keywords,
    }) =>
      runTool(async () => {
        const scoped = await resolveContentForSession(
          workflowService,
          contents,
          ruleId,
          auth,
          { contentId, workflowId },
        );
        if (!scoped.ok) return scoped.observation;
        const locked = assertContentEditable(String(scoped.content.status));
        if (locked) return locked;

        const nodeId = fromNodeId?.trim();
        if (nodeId) {
          const fresh = await contents.findById(scoped.content.contentId, auth);
          const source = fresh ?? scoped.content;
          const outputs =
            source.nodeOutputs &&
            typeof source.nodeOutputs === 'object' &&
            !Array.isArray(source.nodeOutputs)
              ? (source.nodeOutputs as Record<string, Record<string, unknown>>)
              : {};
          const output = outputs[nodeId];
          if (!output) {
            return toolError(
              'not_ready',
              'That node has no output yet. Wait for the re-run to finish, then copy it.',
              { nodeId },
            );
          }
          if (output._pending === true) {
            return toolError(
              'not_ready',
              'That node is still re-running. Wait, then copy its result.',
              { nodeId },
            );
          }
          const edits =
            source.nodeUserEdits &&
            typeof source.nodeUserEdits === 'object' &&
            !Array.isArray(source.nodeUserEdits)
              ? (source.nodeUserEdits as Record<string, Record<string, unknown>>)
              : {};
          const userEdits =
            source.userEdits &&
            typeof source.userEdits === 'object' &&
            !Array.isArray(source.userEdits)
              ? (source.userEdits as Record<string, unknown>)
              : {};
          const catalog = await contentService.describeDraftNodes(
            scoped.content.contentId,
            auth,
          );
          const view = catalog.nodes.find((node) => node.nodeId === nodeId);
          const laneOutputs =
            source.laneOutputs &&
            typeof source.laneOutputs === 'object' &&
            !Array.isArray(source.laneOutputs)
              ? (source.laneOutputs as Record<string, Record<string, unknown>>)
              : {};
          const copied = applyNodeOutputToDraft({
            nodeId,
            output,
            userEdits,
            nodeUserEdits: edits,
            nodeOutputs: outputs,
            laneOutputs,
            lane:
              view?.lane ??
              (typeof output.channel === 'string' ? output.channel : null),
          });
          await contentService.saveContent(
            scoped.content.contentId,
            {
              userEdits: copied.userEdits as SaveContentDto['userEdits'],
              nodeUserEdits: copied.nodeUserEdits,
              nodeOutputs: copied.nodeOutputs,
              laneOutputs: copied.laneOutputs,
            },
            auth,
          );
        } else {
          const userEdits: Record<string, string> = {};
          if (text !== undefined) userEdits.text = text;
          if (translatedText !== undefined) userEdits.translatedText = translatedText;
          if (summary !== undefined) userEdits.summary = summary;
          if (keywords !== undefined) userEdits.keywords = keywords;
          if (Object.keys(userEdits).length === 0) {
            return toolError(
              'empty_patch',
              'Pass fromNodeId to copy a re-run, or at least one of text, translatedText, summary, or keywords.',
            );
          }
          await contentService.saveContent(
            scoped.content.contentId,
            { userEdits },
            auth,
          );
        }

        const updated = await contents.findById(scoped.content.contentId, auth);
        return showContentPayload(previewFromRecord(updated ?? scoped.content), {
          saved: true,
          fromNodeId: nodeId || null,
        });
      }),
    {
      name: 'save_content',
      description:
        'Copy a finished node result onto this draft (fromNodeId). Call it after rerun_content_node has completed - not in the same turn, and not with a caption you wrote. Manual text/translation/summary/keywords patches are only for a tiny correction. Never use it to store an attached file.',
      schema: SAVE_CONTENT_SCHEMA,
    },
  );
}
