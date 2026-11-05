import { ContentStatus } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { ContentPageItemDto } from '../../content/dto/content-page-query.dto';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import type { ContentRecord } from '../../domain/content/content.types';
import type { WorkflowService } from '../../workflow/workflow.service';
import { resolveWorkflowForSession } from './pipeline-scope.util';
import { toolError, toolOk } from './tool-error.util';

const TEXT_LIMIT = 400;

export { resolveWorkflowForSession };

/**
 * End the turn after these content/upload actions.
 * content_approved no longer stops so publish_now can approve+publish in one path;
 * generate_more / content_rerun stay open so Adapt + image can run together.
 */
export const CONTENT_MUTATION_STOP_ACTIONS = new Set([
  'content_rejected',
  'publish_started',
  'scheduled',
]);

export function isContentMutationStopObservation(result: string): boolean {
  try {
    const parsed: unknown = JSON.parse(result);
    if (!parsed || typeof parsed !== 'object') return false;
    const obj = parsed as { ok?: unknown; action?: unknown };
    return (
      obj.ok === true &&
      typeof obj.action === 'string' &&
      CONTENT_MUTATION_STOP_ACTIONS.has(obj.action)
    );
  } catch {
    return false;
  }
}

export type ContentPreview = {
  contentId: string;
  pipelineId: string;
  workflowId: string;
  status: string;
  textPreview: string;
  translatedPreview: string;
  summaryPreview: string;
  hasImage: boolean;
  hasVideo: boolean;
  hasTranslation: boolean;
  hasSummary: boolean;
};

export function truncateText(value: string, limit = TEXT_LIMIT): string {
  const text = value.trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string' && entry.trim()) out[key] = entry;
  }
  return out;
}

export function previewFromOutputs(
  outputs: unknown,
  userEdits?: unknown,
): Omit<ContentPreview, 'contentId' | 'pipelineId' | 'workflowId' | 'status'> {
  const base = asStringMap(outputs);
  const edits = asStringMap(userEdits);
  const merged = { ...base, ...edits };
  const text = merged.text ?? '';
  const translated = merged.translatedText ?? '';
  const summary = merged.summary ?? '';
  return {
    textPreview: truncateText(text),
    translatedPreview: truncateText(translated),
    summaryPreview: truncateText(summary),
    hasImage: Boolean(merged.image?.trim()),
    hasVideo: Boolean(merged.video?.trim()),
    hasTranslation: Boolean(translated.trim()),
    hasSummary: Boolean(summary.trim()),
  };
}

/** True when any per-node output (or user edit) has a non-empty `field` string. */
function nodeMapHasField(
  field: 'image' | 'video',
  ...maps: unknown[]
): boolean {
  for (const map of maps) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
    for (const entry of Object.values(map as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const value = (entry as Record<string, unknown>)[field];
      if (typeof value === 'string' && value.trim()) return true;
    }
  }
  return false;
}

export function previewFromPageItem(row: ContentPageItemDto): ContentPreview {
  return {
    contentId: row.contentId,
    pipelineId: row.pipelineRef,
    workflowId: row.workflowRef,
    status: String(row.status),
    ...previewFromOutputs(row.outputs),
  };
}

export function previewFromRecord(row: ContentRecord): ContentPreview {
  const preview = previewFromOutputs(row.outputs, row.userEdits);
  // Image/video nodes write to nodeOutputs; the top-level outputs.image is
  // often unset, which made get_content report hasImage:false (I-10).
  return {
    contentId: row.contentId,
    pipelineId: row.pipelineRef,
    workflowId: row.workflowRef,
    status: String(row.status),
    ...preview,
    hasImage:
      preview.hasImage ||
      nodeMapHasField('image', row.nodeOutputs, row.nodeUserEdits),
    hasVideo:
      preview.hasVideo ||
      nodeMapHasField('video', row.nodeOutputs, row.nodeUserEdits),
  };
}

export function showContentPayload(
  preview: ContentPreview,
  extra?: Record<string, unknown>,
): string {
  return toolOk({
    action: extra?.action ?? 'show_content',
    ...preview,
    ...extra,
  });
}

export async function listContentsForWorkflow(
  contents: IContentRepository,
  ruleId: string,
  workflowId: string,
  auth: TenancyAuth,
  status?: ContentStatus,
  page = 1,
): Promise<ContentPageItemDto[]> {
  const { data } = await contents.findPage(
    {
      page,
      limit: 10,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      filter: {
        ruleRef: ruleId,
        workflowRef: workflowId,
        ...(status ? { status } : {}),
      },
    },
    auth,
  );
  return data.filter(
    (row) => row.ruleRef === ruleId && row.workflowRef === workflowId,
  );
}

export function assertContentOnWorkflow(args: {
  contentRuleRef: string;
  contentWorkflowRef: string;
  ruleId: string;
  workflowId: string;
}): string | null {
  if (
    args.contentRuleRef !== args.ruleId ||
    args.contentWorkflowRef !== args.workflowId
  ) {
    return toolError('not_found', 'Content not found for this workflow.');
  }
  return null;
}

export async function resolveContentForSession(
  workflowService: WorkflowService,
  contents: IContentRepository,
  ruleId: string,
  auth: TenancyAuth,
  args?: { contentId?: string; workflowId?: string; pipelineId?: string },
): Promise<
  | { ok: true; workflowId: string; content: ContentRecord }
  | { ok: false; observation: string }
> {
  const scoped = await resolveWorkflowForSession(
    workflowService,
    ruleId,
    auth,
    args?.workflowId,
  );
  if (!scoped.ok) return scoped;

  const workflowId = scoped.workflow.workflowId;
  const requested = args?.contentId?.trim();
  if (requested) {
    const row = await contents.findById(requested, auth);
    if (!row) {
      return {
        ok: false,
        observation: toolError('not_found', 'Content not found for this workflow.'),
      };
    }
    const mismatch = assertContentOnWorkflow({
      contentRuleRef: row.ruleRef,
      contentWorkflowRef: row.workflowRef,
      ruleId,
      workflowId,
    });
    if (mismatch) return { ok: false, observation: mismatch };
    return { ok: true, workflowId, content: row };
  }

  const pipelineId = args?.pipelineId?.trim();
  if (pipelineId) {
    const row = await contents.findLatestByPipeline(pipelineId, auth);
    if (!row) {
      return {
        ok: false,
        observation: toolError(
          'no_content',
          'This pipeline has no content yet. Wait until generation finishes.',
          { pipelineId, workflowId },
        ),
      };
    }
    const mismatch = assertContentOnWorkflow({
      contentRuleRef: row.ruleRef,
      contentWorkflowRef: row.workflowRef,
      ruleId,
      workflowId,
    });
    if (mismatch) return { ok: false, observation: mismatch };
    return { ok: true, workflowId, content: row };
  }

  const rows = await listContentsForWorkflow(contents, ruleId, workflowId, auth);
  const latest = rows[0];
  if (!latest) {
    return {
      ok: false,
      observation: toolError(
        'no_content',
        'This workflow has no content yet. Start generation and wait until the run finishes.',
        { workflowId },
      ),
    };
  }
  const row = await contents.findById(latest.contentId, auth);
  if (!row) {
    return {
      ok: false,
      observation: toolError('no_content', 'This workflow has no content yet.', {
        workflowId,
      }),
    };
  }
  return { ok: true, workflowId, content: row };
}

const EDITABLE = new Set<string>([
  ContentStatus.draft,
  ContentStatus.in_review,
  ContentStatus.approved,
]);

export function assertContentEditable(status: string): string | null {
  if (EDITABLE.has(status)) return null;
  return toolError(
    'not_editable',
    `This content is ${status}. Only draft, in-review, or approved content can be edited, re-run, or generated more.`,
    { status },
  );
}
