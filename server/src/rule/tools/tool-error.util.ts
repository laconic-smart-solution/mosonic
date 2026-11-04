import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { InsufficientCreditsException } from '../../credit/insufficient-credits.exception';

/**
 * Short "what to do next" hint per error code, sent to the model with every
 * ok:false observation so it recovers the same way each time.
 */
export const TOOL_ERROR_NEXT: Readonly<Record<string, string>> = {
  capability_mismatch: 'Nothing ran. Call ask_user ONCE with plan = the plan in this result (youAskedFor, willChange, notPossible), a short question, and options yes "Yes" / change "Change". Promise only what will run. On yes: run the willChange tools, then call start_generation again with acceptGaps true.',
  capability_gap: 'Nothing ran. Part of the request cannot run (plan.notPossible). Call ask_user ONCE with plan = this plan, a short question, and options yes "Yes" / change "Change". On yes call start_generation again with acceptGaps true. Never claim the unsupported parts will happen.',
  no_workflow: 'Nothing ran. Call ask_user "Set up the default workflow now?" (Yes / Not now); on Yes call apply_default_workflow. Never send the user to the canvas for this.',
  workflow_not_ready: 'The workflow is still being prepared. Tell the user, and offer to check again in a moment (list_workflows). Do not start anything.',
  not_found: 'Re-list (list_workflows, list_contents or list_pipelines) and use an id from the result. Never guess an id.',
  node_not_found: 'Call list_workflows and use a nodeId from it. Never guess an id.',
  scope_mismatch: 'That belongs to another brand. Ask the user which brand they mean; do not act on the other brand.',
  insufficient_credits: 'The user is out of credits. Say so plainly and that they need to top up. Do not retry, and do not claim anything was created or started.',
  rate_limited: 'The service is busy. Say it failed for now and offer to try again later. Do not invent results.',
  external_error: 'An outside service failed. Say it failed and do not invent data or results.',
  error: 'It failed. Say so in one plain sentence and do not claim it worked. Do not retry the same call.',
  tool_failed: 'It failed. Say so in one plain sentence and do not claim it worked. Do not retry the same call.',
  bad_request: 'The request was rejected. Fix the arguments from the message once, or tell the user what is missing.',
  invalid_config: 'Nothing changed. Fix the config from the error message once, or say the setting is not available.',
  unsupported_channel: 'Nothing changed. Say the channel is not supported and list the supported ones.',
  lane_taken: 'That channel caption already exists on this draft. Call rerun_content_node to change it, or pick a different lane.',
  workflow_exists: 'A workflow already exists. Use it; only replace it after ask_user confirms.',
  stalled: 'Stop calling tools. Tell the user honestly what did not work and what they can do next.',
  no_upload:
    'No upload row yet. Call publish_now (it approves and publishes), or approve_content first then get_upload.',
  channel_not_connected:
    'That channel is not connected. Call start_channel_oauth for it, wait for the user to finish, then check_channel_auth and publish.',
  order_not_supported: 'Nothing changed. Give the one-sentence reason and say they can rearrange it on the workflow canvas (the button is shown).',
  edit_not_supported: 'Nothing changed. Give the one-sentence reason and say they can change it on the workflow canvas (the button is shown).',
  rerun_pending: 'Stop calling tools. Say the new version is being made; after it finishes, save_content with fromNodeId copies it onto the draft.',
  workflow_just_built: 'Do not create another workflow. The one just made is ready: for a post request call start_generation now.',
  plan_first: 'Change nothing yet. Call start_generation first; its plan card asks before any channel or step change.',
  confirm_start: 'Report the change, then ask_user "Start the post now?" (Yes / Not now).',
  already_started: 'Call ask_user "Already started that post. Make another one?" with options yes "Yes" / no "No". On Yes call start_generation again.',
  use_generate_more_adapt: 'Nothing changed. For the latest post call generate_more_adapt with that channel as lane. Change the saved workflow only if the user asks to change it for future posts.',
  image_step_present: 'Call ask_user with options remove "Remove the image step, then make the post" and keep "Keep images". On remove call remove_workflow_node and start the post on the next message; on keep call start_generation.',
  lane_unchanged: 'Nothing changed. Say that step is already on that channel; do not say you moved it.',
  no_translation_step: 'Nothing ran. Say in one sentence which languages have no Translation step, then call ask_user with plan = this plan and options add "Add translation" / skip "Skip translation". On add: add_workflow_node type translation with config.targetLanguage, once per language (one per channel lane in a multi-channel workflow; a lane takes one language), then call start_generation again with the same languages. On skip: start_generation with skipTranslation true.',
  upload_invalid: 'Nothing was published. Tell the user each issue in plain words and offer the fix (add_upload_media for missing media, edit_upload_channel for caption/title or to exclude the channel). Do not retry publishing until fixed.',
  channel_locked: 'Nothing changed. That channel is already scheduled or published. For a scheduled post offer reschedule_publish or cancel_schedule; a published post cannot be edited from chat.',
  no_change: 'Nothing changed. Say so in one plain sentence.',
  lane_not_changed: 'The step is still on its old channel. Say the move did not work; never claim the channel changed.',
};

export function toolError(
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): string {
  const next = TOOL_ERROR_NEXT[code];
  return JSON.stringify({ ok: false, code, message, ...(next ? { next } : {}), ...extra });
}

export function toolOk(payload: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...payload });
}

function exceptionMessage(err: HttpException): string {
  const body = err.getResponse();
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map(String).join('; ');
  }
  return err.message;
}

/** Map service exceptions to a tool observation. Returns null for unknown errors. */
export function fromHttpException(err: unknown): string | null {
  if (err instanceof InsufficientCreditsException) {
    const body = err.getResponse() as {
      message?: string;
      requiredCredits?: number;
      creditsRemaining?: number;
    };
    return toolError(
      'insufficient_credits',
      body.message ?? 'Not enough credits',
      {
        requiredCredits: body.requiredCredits,
        creditsRemaining: body.creditsRemaining,
      },
    );
  }
  if (err instanceof NotFoundException) {
    return toolError('not_found', exceptionMessage(err));
  }
  if (err instanceof BadRequestException) {
    const message = exceptionMessage(err);
    if (/at least one distribution channel/i.test(message)) {
      return toolError('no_channels', message);
    }
    if (/select at least one rule channel/i.test(message)) {
      return toolError(
        'invalid_channels',
        `${message} Use apply_default_workflow, or add Instagram, Facebook, LinkedIn, or TikTok on the brand profile.`,
      );
    }
    if (/no nodes to execute/i.test(message)) {
      return toolError('empty_workflow', message);
    }
    if (/contentPrompt must not be empty/i.test(message)) {
      return toolError('empty_prompt', message);
    }
    if (/invalid config/i.test(message) || /invalid node config/i.test(message)) {
      return toolError('invalid_config', message);
    }
    if (/only draft(, in-review,)? or (in-review|approved)/i.test(message)) {
      return toolError('not_editable', message);
    }
    if (/not available for Generate More/i.test(message)) {
      return toolError('not_supported', message);
    }
    return toolError('bad_request', message);
  }
  if (err instanceof HttpException) {
    const status = err.getStatus();
    if (status === 429) return toolError('rate_limited', exceptionMessage(err));
    if (status === 402 || /not enough credits|insufficient credits/i.test(exceptionMessage(err))) {
      return toolError('insufficient_credits', exceptionMessage(err));
    }
    if (status === 403) return toolError('scope_mismatch', exceptionMessage(err));
    if (status >= 400 && status < 500) return toolError('external_error', exceptionMessage(err));
    return toolError('error', exceptionMessage(err));
  }
  if (err instanceof Error && /not enough credits|insufficient credits/i.test(err.message)) {
    return toolError('insufficient_credits', err.message);
  }
  if (err instanceof Error && /\b429\b|rate limit/i.test(err.message)) {
    return toolError('rate_limited', err.message);
  }
  return null;
}

export async function runTool(fn: () => Promise<string>): Promise<string> {
  try {
    return await fn();
  } catch (err) {
    const mapped = fromHttpException(err);
    if (mapped) return mapped;
    const message = err instanceof Error ? err.message : String(err);
    return toolError('error', message);
  }
}
