import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
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

const MAX_FIELD = 5000;
const FIELDS = ['text', 'translatedText', 'summary', 'keywords'] as const;

/**
 * User-dictated edits to a draft ("change the caption to ...", "add #sale at
 * the end"). Unlike save_content (copy a re-run, tiny fixes), this is the
 * normal path for real wording the user typed. Generated rewrites still go
 * through rerun_content_node.
 */
export function createEditContentTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  contentService: ContentService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, workflowId, mode, ...fields }) =>
      runTool(async () => {
        const given = FIELDS.filter((f) => typeof fields[f] === 'string');
        if (!given.length) return toolError('empty_patch', 'Pass at least one of text, translatedText, summary, keywords.');
        const tooLong = given.find((f) => (fields[f] as string).length > MAX_FIELD);
        if (tooLong) return toolError('bad_request', `${tooLong} is longer than ${MAX_FIELD} characters.`);
        const scoped = await resolveContentForSession(workflowService, contents, ruleId, auth, { contentId, workflowId });
        if (!scoped.ok) return scoped.observation;
        const locked = assertContentEditable(String(scoped.content.status));
        if (locked) return locked;

        const existing = (scoped.content.userEdits && typeof scoped.content.userEdits === 'object' && !Array.isArray(scoped.content.userEdits)
          ? scoped.content.userEdits
          : {}) as Record<string, unknown>;
        const outputs = (scoped.content.outputs && typeof scoped.content.outputs === 'object' ? scoped.content.outputs : {}) as Record<string, unknown>;
        const userEdits: Record<string, string> = {};
        for (const f of given) {
          const value = (fields[f] as string).trim();
          if (mode === 'append') {
            const base = String(existing[f] ?? outputs[f] ?? '').trimEnd();
            userEdits[f] = base ? `${base}\n${value}` : value;
          } else {
            userEdits[f] = value;
          }
        }
        await contentService.saveContent(scoped.content.contentId, { userEdits }, auth);
        const updated = await contents.findById(scoped.content.contentId, auth);
        return showContentPayload(previewFromRecord(updated ?? scoped.content), {
          action: 'content_edited',
          edited: given,
          mode: mode ?? 'replace',
        });
      }),
    {
      name: 'edit_content',
      description:
        'Edit the draft with wording the user gave: replace (default) or append to the caption text, translation, summary or keywords. Use for "change the caption to ...", "add this hashtag". Not for rewrites you would invent (shorter, funnier): use rerun_content_node. Works on draft, in-review and approved content (e.g. adding a Burmese version to an approved post); rejected content cannot be edited. To change one channel\'s caption on the publish draft use edit_upload_channel.',
      schema: z.object({
        contentId: z.string().optional().describe('Content id. Omit to edit the latest draft.'),
        workflowId: z.string().optional(),
        mode: z.enum(['replace', 'append']).optional(),
        text: z.string().optional().describe('Main caption/post text.'),
        translatedText: z.string().optional(),
        summary: z.string().optional(),
        keywords: z.string().optional(),
      }),
    },
  );
}
