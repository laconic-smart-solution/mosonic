import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { RuleAssetRecord } from '../../repositories/interfaces/rule-asset.repository.interface';
import type { WorkflowHeygenService } from '../../workflow/workflow-heygen.service';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool, toolError, toolOk } from './tool-error.util';

const LOOK_NODE_TYPES = new Set(['video_presenter', 'video_cinematic']);
const PORTRAIT_ASSET_TYPES = new Set(['reference_image', 'logo']);
const IMAGE_MIME = /^image\/(png|jpe?g|webp)$/i;

export type VideoLookToolDeps = {
  ruleId: string;
  workflowService: WorkflowService;
  heygen: WorkflowHeygenService;
  /** Brand (rule) assets for this rule. */
  listRuleAssets: () => Promise<RuleAssetRecord[]>;
  /** Fetchable http(s) URLs for a stored asset. */
  assetFetchUrls: (asset: RuleAssetRecord) => string[];
  auth: TenancyAuth;
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isPortraitCandidate(asset: RuleAssetRecord): boolean {
  return (
    PORTRAIT_ASSET_TYPES.has(String(asset.type)) &&
    String(asset.status) === 'ready' &&
    IMAGE_MIME.test(asset.mimeType ?? '') &&
    Boolean(asset.fileUrl?.trim() || asset.relativePath?.trim())
  );
}

function nodeLookSummary(node: { nodeId: string; type: unknown; config?: unknown }) {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  return {
    nodeId: node.nodeId,
    type: String(node.type),
    lookId: str(cfg.heygenAvatarId) || null,
    lookIds: Array.isArray(cfg.heygenAvatarIds) ? cfg.heygenAvatarIds.map(str).filter(Boolean) : [],
    sourceRuleAssetId: str(cfg.heygenLookSourceRuleAssetId) || null,
  };
}

export function createListHeygenLooksTool(deps: VideoLookToolDeps) {
  return tool(
    async ({ includeAccountLooks }) =>
      runTool(async () => {
        const current = await deps.workflowService.getWorkflowByRuleId(deps.ruleId, deps.auth);
        const videoNodes = (current?.nodes ?? [])
          .filter((n) => LOOK_NODE_TYPES.has(String(n.type)))
          .map(nodeLookSummary);
        const [saved, assets] = await Promise.all([
          deps.heygen.listAvatarLooksForUser(deps.auth.userId),
          deps.listRuleAssets(),
        ]);
        const savedLooks = saved.map((l) => ({
          lookId: l.lookId,
          name: l.name,
          previewImageUrl: l.previewImageUrl ?? null,
        }));
        const brandPortraits = assets.filter(isPortraitCandidate).map((a) => ({
          ruleAssetId: a.ruleAssetId,
          name: a.originalFileName,
          type: String(a.type),
          description: a.aiDescription?.slice(0, 200) ?? null,
        }));
        let accountLooks: Array<{ lookId: string; name: string }> | undefined;
        if (includeAccountLooks) {
          const all = await deps.heygen.listAccountLooks();
          accountLooks = all.slice(0, 30).map((l) => ({ lookId: l.lookId, name: l.name }));
        }
        return toolOk({
          videoNodes,
          savedLooks,
          brandPortraits,
          ...(accountLooks ? { accountLooks } : {}),
          hint: 'To use a look: set_video_node_look with lookId. To make a look from a brand portrait: set_video_node_look with ruleAssetId (creates a HeyGen photo avatar).',
        });
      }),
    {
      name: 'list_heygen_looks',
      description:
        'Read-only. Lists HeyGen looks the user can put on a video_presenter / video_cinematic step: savedLooks (their avatars), brandPortraits (brand image assets that can become a look), the current look on each video step, and accountLooks when includeAccountLooks is true. Call before set_video_node_look. Never invent look ids.',
      schema: z.object({
        includeAccountLooks: z
          .boolean()
          .optional()
          .describe('Also list stock / account HeyGen looks (slower).'),
      }),
    },
  );
}

const SET_LOOK_SCHEMA = z.object({
  nodeId: z.string().describe('video_presenter or video_cinematic node id from list_workflows / list_heygen_looks.'),
  lookId: z.string().optional().describe('A lookId from list_heygen_looks (savedLooks or accountLooks).'),
  ruleAssetId: z
    .string()
    .optional()
    .describe('A brandPortraits ruleAssetId: turns that brand image into a new HeyGen look and sets it.'),
  extraLookIds: z
    .array(z.string())
    .max(2)
    .optional()
    .describe('Cinematic only: up to 2 more looks (3 total).'),
});

export function createSetVideoNodeLookTool(deps: VideoLookToolDeps) {
  return tool(
    async ({ nodeId, lookId, ruleAssetId, extraLookIds }) =>
      runTool(async () => {
        const id = nodeId.trim();
        const look = str(lookId);
        const assetId = str(ruleAssetId);
        if (!id) return toolError('node_not_found', 'nodeId is required.');
        if (Boolean(look) === Boolean(assetId)) {
          return toolError('bad_request', 'Pass exactly one of lookId or ruleAssetId.');
        }
        const current = await deps.workflowService.getWorkflowByRuleId(deps.ruleId, deps.auth);
        if (!current) {
          return toolError('no_workflow', 'This brand has no workflow yet.');
        }
        if (current.workflow.ruleRef && current.workflow.ruleRef !== deps.ruleId) {
          return toolError('not_found', 'Workflow not found for this brand.');
        }
        const node = current.nodes.find((n) => n.nodeId === id);
        if (!node) {
          return toolError('node_not_found', `Node ${id} is not on this workflow.`, {
            workflowId: current.workflow.workflowId,
          });
        }
        if (!LOOK_NODE_TYPES.has(String(node.type))) {
          return toolError(
            'invalid_config',
            `${String(node.type)} has no look. Use a video_presenter or video_cinematic step.`,
            { nodeId: id },
          );
        }

        let source: { ruleAssetId: string; imageUrls: string[]; name: string; mimeType?: string } | undefined;
        if (assetId) {
          const asset = (await deps.listRuleAssets()).find((a) => a.ruleAssetId === assetId);
          if (!asset) {
            return toolError('not_found', `Brand asset ${assetId} not found. Use a ruleAssetId from list_heygen_looks.`);
          }
          if (!isPortraitCandidate(asset)) {
            return toolError('bad_request', 'That brand asset is not a ready PNG/JPEG/WebP image.');
          }
          const imageUrls = deps.assetFetchUrls(asset);
          if (!imageUrls.length) {
            return toolError('bad_request', 'That brand asset has no fetchable image URL.');
          }
          source = {
            ruleAssetId: asset.ruleAssetId,
            imageUrls,
            name: asset.originalFileName?.replace(/\.[^.]+$/, '').trim() || 'Brand portrait',
            mimeType: asset.mimeType,
          };
        }

        const result = await deps.heygen.setVideoNodeLook(
          current.workflow.workflowId,
          id,
          { ...(look ? { lookId: look } : {}), ...(source ? { source } : {}), extraLookIds },
          deps.auth,
        );
        return toolOk({
          workflowId: current.workflow.workflowId,
          nodeId: id,
          type: String(node.type),
          lookId: result.lookId,
          lookIds: result.lookIds,
          ...(result.createdFromRuleAssetId ? { createdFromRuleAssetId: result.createdFromRuleAssetId } : {}),
          ...(result.previewUrl ? { previewUrl: result.previewUrl } : {}),
          config: result.config,
        });
      }),
    {
      name: 'set_video_node_look',
      description:
        'Purpose: set the HeyGen look on ONE video_presenter or video_cinematic workflow step from chat (no canvas needed). ' +
        'Use when: the user picks a look, or wants their brand portrait / person photo as the presenter or cinematic look. ' +
        'Args: nodeId; exactly one of lookId (from list_heygen_looks) or ruleAssetId (a brandPortraits id: creates a new HeyGen photo avatar from it, takes a few seconds); extraLookIds for cinematic multi-look. ' +
        'Only after the user agreed (ask_user). Does not generate a video. Presenter still needs a voice (update_node_config heygenVoiceId).',
      schema: SET_LOOK_SCHEMA,
    },
  );
}

export function createListHeygenVoicesTool(deps: Pick<VideoLookToolDeps, 'heygen'>) {
  return tool(
    async ({ language, gender, limit }) =>
      runTool(async () => {
        const page = await deps.heygen.listVoicesPage({
          ...(language ? { language } : {}),
          ...(gender ? { gender } : {}),
          limit: limit ?? 15,
        });
        return toolOk({
          voices: page.voices.map((v) => ({
            voiceId: v.voiceId,
            name: v.name,
            language: v.language,
            ...(v.gender ? { gender: v.gender } : {}),
          })),
          hasMore: page.hasMore,
          hint: 'Offer 2-4 voices with ask_user; on pick call update_node_config on the video_presenter node with config {heygenVoiceId}.',
        });
      }),
    {
      name: 'list_heygen_voices',
      description:
        'Read-only. Lists HeyGen voices for a video_presenter step (voiceId, name, language, gender). Filter by language (e.g. English, Thai) or gender. Use when a presenter has no voice or the user wants a different one; never invent voice ids.',
      schema: z.object({
        language: z.string().optional().describe('Voice language name, e.g. English, Thai.'),
        gender: z.enum(['male', 'female']).optional(),
        limit: z.number().int().min(1).max(30).optional(),
      }),
    },
  );
}
