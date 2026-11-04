import { randomUUID } from 'node:crypto';
import { toolOk } from '../tools/tool-error.util';

/** Tools that spend generation tokens (text, images, video). Read at turn time from ConfigService (restart the server after changing .env). */
export const GENERATION_TOOL_NAMES: ReadonlySet<string> = new Set([
  'start_generation',
  'rerun_content_node',
  'generate_more_image',
  'generate_more_translation',
  'generate_more_summary',
  'generate_more_adapt',
  'generate_presenter_video',
  'generate_cinematic_video',
]);

/**
 * CHAT_EVAL_DRY_RUN=true (eval runs only): a generation tool returns a fake
 * "started" observation and nothing is enqueued, so scripted evals can check
 * that the AI *would* start a run without paying for images. Returns null for
 * every other tool. Pipeline ids start with "dryrun-" so the chat never
 * watches them.
 */
export function dryRunGenerationResult(
  name: string,
  args: Record<string, unknown>,
): string | null {
  if (!GENERATION_TOOL_NAMES.has(name)) return null;
  if (name === 'start_generation') {
    return toolOk({
      action: 'pipeline_started',
      pipelineId: `dryrun-${randomUUID()}`,
      status: 'running',
      dryRun: true,
      contentPrompt: typeof args.contentPrompt === 'string' ? args.contentPrompt : '',
    });
  }
  return toolOk({
    action: name === 'rerun_content_node' ? 'content_rerun_started' : 'generate_more_started',
    dryRun: true,
  });
}
