import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { OrchestrationService } from '../../orchestration/orchestration.service';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import { listPipelinesForWorkflow, pickActivePipeline } from './pipeline-scope.util';
import { WorkflowStatus } from '../../workflow/schemas/workflow.schema';
import type { WorkflowService } from '../../workflow/workflow.service';
import { randomUUID } from 'node:crypto';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import { normalizeLaneId } from '../../workflow/workflow-graph.util';
import { runTool, toolError, toolOk } from './tool-error.util';
import { normalizeLanguage, parseRequest, preflightRequest } from '../capability.util';
import type { SourcePackAsset } from '../../pipeline/source-pack.types';
import { buildGenerationPreview, generationPreviewPrompt } from './generation-preview.tools';

export type StartGenerationOptions = {
  /** CHAT_EVAL_DRY_RUN: validate everything, then answer "started" without enqueuing. */
  dryRun?: boolean;
  /** Saved style note (brand memory), shown in the run brief. */
  styleNote?: string | null;
  /** Brand profile channels, used when the workflow has no channel lanes. */
  brandChannels?: string[];
  /** The user's latest real request (not a chip click), for the preflight. */
  requestText?: string;
  /** The user's latest message says no images / text only. */
  textOnlyRequest?: boolean;
  /** Image asset ids attached in this chat. */
  attachedAssetIds?: string[];
  /** Loads image assets by id as source-pack references. */
  loadReferenceAssets?: (ids: string[]) => Promise<SourcePackAsset[]>;
  /** Brand base language (ISO code); a request in this language needs no translation step. */
  baseLanguage?: string | null;
  /** No workflow yet: build the default one, then start (first post in one turn). */
  setupDefaultWorkflow?: () => Promise<unknown>;
  /**
   * Preview before generate: when set and not confirmed, the tool returns an
   * ask_user preview card (steps, lanes, look, duration, modes) instead of
   * starting. confirmed = the user clicked Start on that card (or Yes on a
   * plan / translation card this run depends on).
   */
  previewGate?: { confirmed: boolean; anyConfirmed?: boolean };
};

export const START_GENERATION_TOOL_NAME = 'start_generation';

export function isPipelineStartedObservation(result: string): boolean {
  try {
    const parsed: unknown = JSON.parse(result);
    return (
      !!parsed &&
      typeof parsed === 'object' &&
      (parsed as { ok?: unknown }).ok === true &&
      (parsed as { action?: unknown }).action === 'pipeline_started'
    );
  } catch {
    return false;
  }
}

const START_GENERATION_SCHEMA = z.object({
  contentPrompt: z
    .string()
    .describe('What to generate this run, for example the post topic.'),
  workflowId: z
    .string()
    .optional()
    .describe('Workflow to run. Omit to use the latest workflow for this brand.'),
  wantsImages: z
    .boolean()
    .optional()
    .describe('true when the user asked for images/photos or set an image style for this post.'),
  style: z.string().optional().describe('Image style for THIS run if the user asked for one (e.g. watercolor). Pass "none" when they said not to use the saved style. Omit otherwise; a saved style is not applied unless asked.'),
  referenceAssetIds: z.array(z.string()).optional().describe('Brand asset ids to use as reference images. Omit to use the images attached in this chat.'),
  acceptGaps: z.boolean().optional().describe('true only after the user said Yes to the plan card from a capability_gap result.'),
  languages: z.array(z.string()).optional().describe('ISO 639-1 codes the post must also be in (e.g. ["th","zh"]) when the user asked for other languages. Each needs a Translation step.'),
  skipTranslation: z.boolean().optional().describe('true only after the user chose to skip translation on a no_translation_step card: run without the extra languages.'),
});

export function createStartGenerationTool(
  ruleId: string,
  workflowService: WorkflowService,
  orchestration: OrchestrationService,
  auth: TenancyAuth,
  pipelines?: IPipelineRepository,
  options: StartGenerationOptions = {},
) {
  return tool(
    async ({ contentPrompt, workflowId, wantsImages, style: styleArg, referenceAssetIds, acceptGaps, languages, skipTranslation }) =>
      runTool(async () => {
        const prompt = contentPrompt.trim();
        if (!prompt) {
          return toolError(
            'empty_prompt',
            'contentPrompt is required. Ask the user what to generate.',
          );
        }

        const requestedId = workflowId?.trim();
        let snapshot = requestedId
          ? await workflowService.getWorkflow(requestedId, auth)
          : await workflowService.getWorkflowByRuleId(ruleId, auth);
        let workflowCreated = false;
        if (!snapshot && !requestedId && options.setupDefaultWorkflow) {
          await options.setupDefaultWorkflow();
          snapshot = await workflowService.getWorkflowByRuleId(ruleId, auth);
          workflowCreated = !!snapshot;
        }
        // A workflow made here stays even when nothing starts: say so.
        const fail = (code: string, message: string, extra?: Record<string, unknown>) =>
          toolError(code, message, workflowCreated ? { ...extra, workflowCreated: true } : extra);

        if (!snapshot) {
          return fail(
            'no_workflow',
            'This brand has no workflow yet. Create one before starting generation. Offer to set up the default workflow with ask_user (Yes / Not now); do not mention the canvas or drafts.',
          );
        }
        if (snapshot.workflow.ruleRef !== ruleId) {
          return fail('scope_mismatch', 'That workflow belongs to another brand.');
        }

        const status = String(snapshot.workflow.status);
        if (status !== WorkflowStatus.Ready && status !== 'ready') {
          return fail(
            'workflow_not_ready',
            `This workflow is ${status}. Generation can start only when it is ready.`,
            { workflowId: snapshot.workflow.workflowId, status },
          );
        }
        if (snapshot.nodes.length === 0) {
          return fail(
            'empty_workflow',
            'This workflow has no nodes to execute.',
            { workflowId: snapshot.workflow.workflowId },
          );
        }

        const hasImageStep = snapshot.nodes.some((n) => String(n.type) === String(WorkflowNodeType.ImageGeneration));
        if (wantsImages && !hasImageStep) {
          return fail(
            'no_image_step',
            'Nothing was started. This workflow has no Image step, so a run makes no images. Tell the user that in one sentence and call ask_user with options "Add image step" and "Text only". On Add image step call add_workflow_node (image_generation, with their style in config if given), confirm, then start the post on the next message.',
          );
        }
        if (hasImageStep && options.textOnlyRequest && !wantsImages) {
          return fail(
            'image_step_present',
            'Nothing was started. The user asked for no images, but this workflow has an Image step and a run always makes its images.',
          );
        }
        // Preflight: compare the request with what this workflow really runs, before anything starts.
        const parsedRaw = parseRequest(`${options.requestText ?? ''}\n${prompt}`);
        const parsed = skipTranslation ? { ...parsedRaw, targetLanguages: [] } : parsedRaw;
        const extraLanguages = skipTranslation ? [] : (languages ?? []).map((l) => normalizeLanguage(l) ?? l.trim().toLowerCase()).filter(Boolean);
        const refIds = (referenceAssetIds?.length ? referenceAssetIds : (options.attachedAssetIds ?? [])).slice(0, 3);
        const refs = refIds.length && options.loadReferenceAssets ? await options.loadReferenceAssets(refIds) : [];
        const plan = preflightRequest({
          request: parsed,
          nodes: snapshot.nodes as never,
          attachedImages: refs.length,
          languages: extraLanguages,
          baseLanguage: options.baseLanguage ?? null,
        });
        if (plan.missingLanguages?.length) {
          const lanes = [...new Set(snapshot.nodes.map((n) => (n.lane ? normalizeLaneId(String(n.lane)) : '')).filter(Boolean))];
          return fail('no_translation_step', `Nothing was started. This workflow has no Translation step for ${plan.missingLanguages.join(', ')}.`, {
            plan,
            missingLanguages: plan.missingLanguages,
            lanes,
          });
        }
        if (plan.willChange.length > 0) {
          return fail('capability_mismatch', 'Nothing was started. The workflow does not produce what was asked yet.', { plan });
        }
        if (plan.notPossible.length > 0 && !acceptGaps) {
          return fail('capability_gap', 'Nothing was started. Part of the request cannot run as asked.', { plan });
        }
        const style = styleArg === 'none' || parsed.noStyle ? null : (styleArg?.trim() || parsed.mentionsStyle || null);
        const runPrompt = style
          ? `${prompt}\nImage style: ${style}.`
          : options.styleNote
            ? `${prompt}\nDo not use the saved image style this time; choose a style that fits the topic.`
            : prompt;
        const lanes = [...new Set(snapshot.nodes.map((n) => (n.lane ? normalizeLaneId(String(n.lane)) : '')).filter(Boolean))];
        const brief = {
          topic: prompt,
          channels: lanes.length > 0 ? lanes : (options.brandChannels ?? []),
          style: hasImageStep ? style : null,
          images: hasImageStep,
          referenceImages: refs.length,
          notPossible: plan.notPossible,
          ...(parsed.targetLanguages.length || extraLanguages.length ? { languages: [...new Set([...parsed.targetLanguages, ...extraLanguages])] } : {}),
        };
        const gateOpen = !!options.previewGate && (options.previewGate.confirmed || (!!options.previewGate.anyConfirmed && !!(acceptGaps || skipTranslation)));
        if (options.previewGate && !gateOpen && !options.dryRun) {
          return generationPreviewPrompt({
            topic: prompt,
            preview: buildGenerationPreview(snapshot.nodes as never),
            brief: { ...brief, ...(workflowCreated ? { workflowCreated: true } : {}) },
          });
        }
        if (options.dryRun) {
          return toolOk({
            action: 'pipeline_started',
            pipelineId: `dryrun-${randomUUID()}`,
            workflowId: snapshot.workflow.workflowId,
            status: 'running',
            dryRun: true,
            ...(workflowCreated ? { workflowCreated: true } : {}),
            contentPrompt: runPrompt,
            referenceImagesUsed: refs.length,
            brief,
          });
        }

        if (pipelines) {
          const active = pickActivePipeline(
            await listPipelinesForWorkflow(
              pipelines,
              snapshot.workflow.workflowId,
              auth,
            ),
          );
          if (active) {
            return fail(
              'already_running',
              'A generation run is already in progress for this brand. Do not start another one. Tell the user it is still running and that the result will appear in this chat when it finishes; they can cancel it from the run card.',
              { pipelineId: active.pipelineId, status: active.status },
            );
          }
        }

        const started = await orchestration.startPipeline({
          workflowId: snapshot.workflow.workflowId,
          ruleId,
          contentPrompt: runPrompt,
          auth,
          referenceAssets: refs,
          metadata: { source: 'manual' },
        });

        return toolOk({
          action: 'pipeline_started',
          pipelineId: started.pipelineId,
          workflowId: snapshot.workflow.workflowId,
          status: 'running',
          ...(workflowCreated ? { workflowCreated: true } : {}),
          brief,
          referenceImagesUsed: refs.length,
          message: refs.length ? `Used ${refs.length} reference image${refs.length > 1 ? 's' : ''}.` : 'No reference images were used.',
        });
      }),
    {
      name: START_GENERATION_TOOL_NAME,
      description:
        'REQUIRED whenever the user wants generated content (a post, caption, image, video, campaign piece): starts the saved workflow pipeline. Never write the content yourself. Put their topic or bullet list in contentPrompt and call this in the same turn - do not ask_user again, unless their reply points at a choice you offered ("the second one") that does not clearly match one option; then ask_user which one. ' +
          'Clear intent with no topic ("let\'s announce my brand", "make a post", or "do"/"yes" right after you offered ONE post): write a short topic from the brief (saved style, brand channels, season) yourself; ask_user with 3 short topic options only when nothing fits. Name only the brand\'s own channels; never add a channel or saved style the user did not ask for. ' +
          '"Use this photo for my post": say in contentPrompt to use the attached reference image; if reference images are needed and none are attached, say so first. "No image" / "text only" (any language) while the workflow has an Image step: do not call this; ask_user "Remove the image step, then make the post" / "Keep images". ' +
          'Other languages ("also in Thai"): pass languages; on no_translation_step follow its next hint. ' +
          'Not for draft edits, re-runs, generate-more or adding a channel to the current post. Omit workflowId to use the latest ready workflow; with no workflow it sets up the default one first (workflowCreated: say so). After pipeline_started stop and say "Started. You can follow along below." (in their language); never invent the generated text.',
      schema: START_GENERATION_SCHEMA,
    },
  );
}
