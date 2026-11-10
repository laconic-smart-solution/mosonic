import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  AIMessage,
  type BaseMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { EventsService } from '../../events/events.service';
import { LlmService } from '../../llm/llm.service';
import {
  CHAT_MESSAGE_REPOSITORY,
  CHAT_SESSION_REPOSITORY,
  CONTENT_REPOSITORY,
  PIPELINE_REPOSITORY,
} from '../../repositories/tokens';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import { ContentService } from '../../content/content.service';
import { CreditService } from '../../credit/credit.service';
import { InsufficientCreditsException } from '../../credit/insufficient-credits.exception';
import type {
  ChatSessionRecord,
  IChatSessionRepository,
} from '../../repositories/interfaces/chat-session.repository.interface';
import type {
  ChatMessageRecord,
  IChatMessageRepository,
} from '../../repositories/interfaces/chat-message.repository.interface';
import { WebsiteAssetHandler } from '../../preprocessing/handlers/website-asset.handler';
import { RuleAssetService } from '../rule-asset.service';
import { RuleAssetSearchService } from '../rule-asset-search.service';
import { RuleMemoryService } from '../rule-memory.service';
import { RuleMemorySearchService } from '../rule-memory-search.service';
import { RuleService } from '../rule.service';
import {
  buildOnboardingPrompt,
  buildRuleBrainPrompt,
} from '../rule-context-builder.util';
import { createSearchBrandAssetsTool } from '../tools/search-brand-assets.tool';
import { createWebSearchTool } from '../tools/web-search.tool';
import { createGetRuleTool } from '../tools/get-rule.tool';
import { createListBrandAssetsTool } from '../tools/list-brand-assets.tool';
import { createRequestAssetUploadTool } from '../tools/request-asset-upload.tool';
import { channelsNamedIn, createCreateRuleFromIntakeTool, intakeFromArgs } from '../tools/create-rule-from-intake.tool';
import { createUpdateRuleTool } from '../tools/update-rule.tool';
import { createFetchWebsiteAssetsTool } from '../tools/fetch-website-assets.tool';
import { createIngestWebsiteContentTool } from '../tools/ingest-website-content.tool';
import { createRememberTool } from '../tools/remember.tool';
import { createForgetAllTool, createForgetTool } from '../tools/forget.tool';
import {
  createAddWorkflowNodeTool,
  createRemoveWorkflowNodeTool,
  createReorderWorkflowNodesTool,
  createSetWorkflowChannelsTool,
} from '../tools/workflow-edit.tools';
import { describeWorkflowSteps } from '../tools/workflow-tool.util';
import {
  listPipelinesForWorkflow,
  pickActivePipeline,
} from '../tools/pipeline-scope.util';
import { dryRunGenerationResult } from './chat-eval-dry-run.util';
import { createSearchBrandMemoryTool } from '../tools/search-brand-memory.tool';
import { createAskUserTool } from '../tools/ask-user.tool';
import { createListWorkflowsTool } from '../tools/list-workflows.tool';
import { buildIntentText, pendingFlowTools, selectTurnTools } from './chat-tool-gating.util';
import { previewFromRecord, showContentPayload } from '../tools/content-scope.util';
import { TEXT_ONLY_REQUEST, attachedImageAssetIds, buildCapabilitySummary, latestRequestText, normalizeLanguage } from '../capability.util';
import { buildRegistrySummary } from '../capability-registry';
import { toImageAsset } from '../../orchestration/brand-image-assets.util';
import { BLANK_BRAND_BLOCKED_TOOLS, BLANK_BRAND_PROMPT, brandNameFromWebsiteUrl, getBrandReadiness, isBlankBrand, shouldGateBlankBrand } from './blank-brand.util';
import { buildGreetingResult, isBareGreeting, sanitizeReply } from './onboarding-greeting.util';
import { isMultiStepRequest } from './multi-step.util';
import { createGenerateWorkflowTool } from '../tools/generate-workflow.tool';
import { createApplyDefaultWorkflowTool } from '../tools/apply-default-workflow.tool';
import { createUpdateNodeConfigTool } from '../tools/update-node-config.tool';
import { createGetNodeConfigTool } from '../tools/get-node-config.tool';
import {
  createDescribeNodeConfigFieldsTool,
  createGetDraftMediaStatusTool,
  createPreviewGenerationTool,
} from '../tools/generation-preview.tools';
import {
  createListHeygenLooksTool,
  createSetVideoNodeLookTool,
  createListHeygenVoicesTool,
} from '../tools/video-look.tools';
import { WorkflowHeygenService } from '../../workflow/workflow-heygen.service';
import { sourceImageFetchUrls } from '../../upload/resolve-absolute-media-url.util';
import { createStartGenerationTool } from '../tools/start-generation.tool';
import { createGetPipelineStatusTool } from '../tools/get-pipeline-status.tool';
import { createListPipelinesTool } from '../tools/list-pipelines.tool';
import { createGetActivePipelineTool } from '../tools/get-active-pipeline.tool';
import { createGetPipelineLogsTool } from '../tools/get-pipeline-logs.tool';
import { createListContentsTool } from '../tools/list-contents.tool';
import { createGetContentTool } from '../tools/get-content.tool';
import { createSaveContentTool } from '../tools/save-content.tool';
import { createApproveContentTool } from '../tools/approve-content.tool';
import { createRejectContentTool } from '../tools/reject-content.tool';
import { createRerunContentNodeTool } from '../tools/rerun-content-node.tool';
import {
  createGenerateMoreAdaptTool,
  createGenerateMoreImageTool,
  createGeneratePresenterVideoTool,
  createGenerateCinematicVideoTool,
  createGenerateMoreSummaryTool,
  createGenerateMoreTranslationTool,
} from '../tools/generate-more.tools';
import { WorkflowService } from '../../workflow/workflow.service';
import { OrchestrationService } from '../../orchestration/orchestration.service';
import { extractAiMessageText } from '../tools/ai-message-text.util';
import {
  CONTINUE_INSTRUCTION_PREFIX,
  runToolCallingLoop,
  type ToolCallingLoopResult,
} from '../tools/tool-calling-loop';
import {
  CHAT_MUTATIONS_PER_TURN,
  CHAT_ITERATIONS_PER_ROUND,
  CHAT_CONTINUE_ROUNDS,
  MUTATING_TOOL_NAMES,
  CONFIRMATION_REQUIRED_TOOL_NAMES,
  ambiguousChoiceObservation,
  confirmationPromptFor,
  isAmbiguousBareReply,
  isConfirmedByUser,
  carriedConfirmation,
  matchesCarriedConfirmation,
  confirmedPlanChain,
  affirmsPendingStartPreview,
  unrequestedProfileChange,
  waivedRecently,
  WAIVABLE_CONFIRMATION_TOOLS,
  repeatedPostRequest,
  repeatedPostRequestInState,
  matchesApproval,
  saveBeforeRerunFinished,
  workflowAlreadyBuilt,
  planBeforeSetupChange,
  startAfterSetupChange,
  pendingPostIntent,
  draftChannelNotTemplate,
} from '../tools/tool-guards.util';
import { createCancelPipelineTool } from '../tools/cancel-pipeline.tool';
import {
  createCheckChannelAuthTool,
  createListChannelsTool,
  createStartChannelOauthTool,
} from '../tools/channel.tools';
import {
  createAddUploadMediaTool,
  createCancelScheduleTool,
  createEditUploadChannelTool,
  createGetUploadTool,
  createPreviewUploadTool,
  createPublishNowTool,
  createRemoveUploadMediaTool,
  createReschedulePublishTool,
  createRetryPublishTool,
  createSchedulePublishTool,
  type ResolveUploadMedia,
} from '../tools/upload.tools';
import { createEditContentTool } from '../tools/edit-content.tool';
import {
  createGetPostAnalyticsTool,
  createGetPostTool,
  createListPostsTool,
} from '../tools/post.tools';
import {
  createApplyRuleSuggestionTool,
  createSuggestRuleImprovementTool,
} from '../tools/rule-suggestion.tools';
import { ChatTurnLockService } from './chat-turn-lock.service';
import {
  ChatPipelineFollowupService,
  startedPipelineIdsFromSteps,
} from './chat-pipeline-followup.service';
import type { AgentStep } from '../tools/tool-calling-loop';
import { buildRunProgress, type ChatRunProgress } from './chat-run-progress.util';
import { toLangChainHistory, webSearchTexts } from './chat-history.util';
import { withReactInstructions } from './react-chat-instructions';
import { McpService } from '../../mcp/mcp.service';
import { PlanChannelAccessService } from '../../plan/plan-channel-access.service';
import { PostService } from '../../post/post.service';
import { RedNoteService } from '../../rednote/rednote.service';
import { UploadService } from '../../upload/upload.service';
import { latestDraftText, renderLiveState, type LiveFacts } from './live-facts.util';
import { buildWorkflowGraphSnapshot } from './workflow-graph-snapshot.util';
import { falseImpossibilityAskBlock } from './false-impossibility.util';
import {
  goalContinueInstruction,
  shouldForceContinueOnGoal,
  verifyGoalAcceptance,
} from './goal-verify.util';
import type { ChatSessionState } from './session-state.types';
import {
  pendingConnectChannels,
  readState,
  reconcile,
  reduceFollowUp,
  reduceLoopOutcome,
  reduceTurnSteps,
  reduceUserMessage,
  renderSessionState,
  startedPostRequests,
  statePendingFor,
} from './session-state.util';

const HISTORY_LIMIT = 20;
/** Page size for the thread UI (GET messages) â€” separate from the AI's HISTORY_LIMIT context window. */
export const MESSAGE_PAGE_DEFAULT = 30;
export const MESSAGE_PAGE_MAX = 100;

export function clampMessagePageLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return MESSAGE_PAGE_DEFAULT;
  return Math.min(MESSAGE_PAGE_MAX, Math.floor(limit));
}

export const PIPELINE_RESULT_TOOL_NAME = 'pipeline_result';

/**
 * Channels the previous assistant turn started a connect for: Zernio OAuth
 * (start_oauth) or the RedNote QR (start_rednote_qr, channel "rednote").
 */
export function oauthStartedChannels(history: { role: string; steps?: unknown }[]): string[] {
  const prev = history[history.length - 2];
  if (prev?.role !== 'assistant' || !Array.isArray(prev.steps)) return [];
  const out = new Set<string>();
  for (const s of prev.steps as { type?: unknown; result?: unknown }[]) {
    if (s?.type !== 'observation' || typeof s.result !== 'string') continue;
    try {
      const r = JSON.parse(s.result) as { ok?: unknown; action?: unknown; platform?: unknown };
      if (r.ok === true && r.action === 'start_oauth' && typeof r.platform === 'string') {
        out.add(r.platform.trim().toLowerCase());
      }
      if (r.ok === true && r.action === 'start_rednote_qr') out.add('rednote');
    } catch {
      // not JSON - not a connect start
    }
  }
  return [...out];
}

/** A chat message as the client may see it: the server-only session state removed. */
export function withoutState(record: ChatMessageRecord): ChatMessageRecord {
  if (!('state' in record)) return record;
  const copy = { ...record };
  delete copy.state;
  return copy;
}

/** Follow-up turns only report; any change waits for the user's next message. */
export const FOLLOWUP_MUTATION_BLOCKED = JSON.stringify({
  ok: false,
  code: 'followup_read_only',
  message:
    'This is an automatic report after a run finished. Do not change anything now; describe the result and offer this as a next step instead.',
});

export type ContextUsage = {
  used: number;
  limit: number;
};

export type ChatTurnResult = {
  userMessage: ChatMessageRecord;
  assistantMessage: ChatMessageRecord;
  contextUsage: ContextUsage;
  /** Current session row â€” lets the client notice create_rule_from_intake bound a ruleId mid-turn. */
  session: ChatSessionRecord;
};

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);
  /** Wait before re-reading Zernio once when a just-connected account is not listed yet. */
  protected oauthRefreshRetryMs = 1500;

  constructor(
    @Inject(CHAT_SESSION_REPOSITORY)
    private readonly sessions: IChatSessionRepository,
    @Inject(CHAT_MESSAGE_REPOSITORY)
    private readonly messages: IChatMessageRepository,
    private readonly ruleService: RuleService,
    private readonly ruleAssetService: RuleAssetService,
    private readonly ruleAssetSearchService: RuleAssetSearchService,
    private readonly ruleMemoryService: RuleMemoryService,
    private readonly ruleMemorySearchService: RuleMemorySearchService,
    private readonly websiteAssetHandler: WebsiteAssetHandler,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
    private readonly events: EventsService,
    @Inject(forwardRef(() => WorkflowService))
    private readonly workflows: WorkflowService,
    @Inject(forwardRef(() => OrchestrationService))
    private readonly orchestration: OrchestrationService,
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelines: IPipelineRepository,
    @Inject(CONTENT_REPOSITORY)
    private readonly contents: IContentRepository,
    @Inject(forwardRef(() => ContentService))
    private readonly contentService: ContentService,
    private readonly credits: CreditService,
    private readonly turnLock: ChatTurnLockService,
    @Inject(forwardRef(() => UploadService))
    private readonly uploadService: UploadService,
    private readonly mcpService: McpService,
    private readonly planChannelAccess: PlanChannelAccessService,
    @Inject(forwardRef(() => PostService))
    private readonly postService: PostService,
    @Inject(forwardRef(() => RedNoteService))
    private readonly redNoteService: RedNoteService,
    @Inject(forwardRef(() => WorkflowHeygenService))
    private readonly workflowHeygen: WorkflowHeygenService,
    @Optional()
    @Inject(forwardRef(() => ChatPipelineFollowupService))
    private readonly runFollowups?: ChatPipelineFollowupService,
  ) {}

  /** Chat path for HeyGen looks on presenter / cinematic steps (no canvas). */
  private videoLookTools(ruleId: string, auth: TenancyAuth) {
    const deps = {
      ruleId,
      workflowService: this.workflows,
      heygen: this.workflowHeygen,
      listRuleAssets: () => this.ruleAssetService.listByRule(ruleId, auth),
      assetFetchUrls: (asset: { fileUrl?: string | null; relativePath?: string | null }) =>
        sourceImageFetchUrls(
          {
            fileUrl: asset.fileUrl ?? undefined,
            relativePath: asset.relativePath ?? undefined,
          },
          {
            fileServiceUrl: this.config.get<string>('FILE_SERVICE_URL') ?? undefined,
            publicBaseUrl:
              this.config.get<string>('APP_URL') ??
              this.config.get<string>('PUBLIC_URL') ??
              undefined,
          },
        ),
      auth,
    };
    return [createListHeygenLooksTool(deps), createSetVideoNodeLookTool(deps), createListHeygenVoicesTool(deps)];
  }

  /** One session per Rule â€” reopens the existing one instead of creating a duplicate. */
  async createSession(
    ruleId: string | undefined,
    title: string | undefined,
    auth: TenancyAuth,
  ) {
    if (ruleId) {
      await this.ruleService.getRuleById(ruleId, auth);
      const existing = await this.sessions.findByRuleId(ruleId, auth);
      if (existing.length > 0) {
        return existing[0];
      }
    }
    return this.sessions.create({
      ruleId: ruleId ?? null,
      userId: auth.userId,
      title: title ?? null,
    });
  }

  async listSessions(ruleId: string, auth: TenancyAuth) {
    await this.ruleService.getRuleById(ruleId, auth);
    return this.sessions.findByRuleId(ruleId, auth);
  }

  /** All of the user's chats regardless of rule â€” what the sidebar shows. */
  async listAllSessions(auth: TenancyAuth) {
    return this.sessions.findByUserId(auth);
  }

  async deleteSession(sessionId: string, auth: TenancyAuth) {
    await this.getOwnedSession(sessionId, auth);
    await this.sessions.deleteById(sessionId, auth);
  }

  /** Newest page by default; pass `before` (a message id) to load older history. */
  async listMessages(
    sessionId: string,
    auth: TenancyAuth,
    opts: { before?: string; limit?: number } = {},
  ) {
    await this.getOwnedSession(sessionId, auth);
    return this.messages.findPageBySessionId(sessionId, {
      before: opts.before || undefined,
      limit: clampMessagePageLimit(opts.limit),
    });
  }

  async sendMessage(
    sessionId: string,
    content: string,
    auth: TenancyAuth,
    opts: { evalDryRun?: boolean } = {},
  ): Promise<ChatTurnResult & { evalDryRun?: boolean; sessionState?: ChatSessionState }> {
    const session = await this.getOwnedSession(sessionId, auth);

    const lockToken = await this.turnLock.tryAcquire(sessionId);
    if (!lockToken) {
      throw new ConflictException(
        'This chat is still answering the previous message. Wait for it to finish, then send again.',
      );
    }
    try {
      return await this.runTurn(session, sessionId, content, auth, opts);
    } finally {
      await this.turnLock.release(sessionId, lockToken);
    }
  }

  private async runTurn(
    session: ChatSessionRecord,
    sessionId: string,
    content: string,
    auth: TenancyAuth,
  opts: { evalDryRun?: boolean } = {},
  ): Promise<ChatTurnResult & { evalDryRun?: boolean }> {
    const userMessage = await this.messages.create({
      session: { connect: { sessionId } },
      role: 'user',
      content,
    });

    const history = await this.messages.findBySessionId(
      sessionId,
      HISTORY_LIMIT,
    );
    const historyMessages = toLangChainHistory(history);
    // approve/reject only run when this message is the user's click on a
    // non-negative ask_user option from the previous assistant turn.
    const userConfirmed = isConfirmedByUser(history);
    // A yes given before a "connect the account first" detour still counts
    // for that same action and target (checked per call in guardToolCall).
    const carried = userConfirmed ? null : carriedConfirmation(history);
    const legacyChain = confirmedPlanChain(history);
    // A bare "do"/"ok" after a plain list of options: ask which, never guess.
    const ambiguousReply = isAmbiguousBareReply(history);

    // Server-kept session state (pending card, approvals, connects, runs).
    // It survives pipeline follow-up rows and off-topic turns that the
    // history parsers above (previous row only) cannot see past. Every guard
    // below is legacy OR state: state only ever adds a confirmation.
    // The history was read right after this turn's user row was written
    // (under the turn lock), so its last row is this message.
    const priorRows = history.at(-1)?.role === 'user' ? history.slice(0, -1) : history;
    const loaded = readState(priorRows);
    const { state: afterUser, resolution } = reduceUserMessage(loaded.state, content);
    const confirmedNow = userConfirmed || resolution.positive;
    const confirmedChain = legacyChain ?? resolution.chain;
    const statePending = statePendingFor(afterUser, resolution);
    const legacyKeep = pendingFlowTools(history, { carriedTool: carried?.toolName, chain: legacyChain });
    const keepTools = pendingFlowTools(history, {
      carriedTool: carried?.toolName,
      chain: confirmedChain,
      statePending,
    });
    // An earlier post request no run has started yet (typed, Make a post chip, or
    // unfinished Session Goal): keep generation tools even when this message is a
    // short ask_user answer that does not match POST_INTENT.
    const postIntent = !!pendingPostIntent(history) || afterUser.goal?.kind === 'make_post';
    if (postIntent) {
      keepTools.add('start_generation');
      keepTools.add('apply_default_workflow');
    }
    // "Yes" / "Start" typed (or a Yes chip on the AI's own "Start now?") while a
    // start_generation plan card is still open counts as tapping Start on it.
    // "Don't ask me, do it yourself all the way to publish": setup guards that only ask first step aside.
    const waived = waivedRecently(history);
    const pendingPostText = pendingPostIntent(history);
    const startAffirmed = affirmsPendingStartPreview(history) || (waived && postIntent);
    if (startAffirmed) keepTools.add('start_generation');
    if (waived) for (const t of ['update_rule', 'set_workflow_channels', 'apply_default_workflow', 'check_channel_auth', 'start_channel_oauth', 'publish_now']) keepTools.add(t);
    this.logStateDiff(sessionId, afterUser, {
      userConfirmed,
      stateConfirmed: resolution.positive,
      carriedTool: carried?.toolName ?? null,
      legacyKeep,
      keepTools,
      source: loaded.source,
    });

    // URLs the tools may use must appear in what the user actually wrote.
    const userTexts = history
      .filter((m) => m.role === 'user')
      .map((m) => m.content);

    // Back from an OAuth tab / RedNote QR ("done"): read the account list
    // fresh, not only the DB the callback may not have updated yet.
    if (session.ruleId) {
      const recentConnects = pendingConnectChannels({
        ...afterUser,
        pending: afterUser.pending.filter((p) => p.kind === 'connect' && p.turn >= afterUser.turn - 1),
      });
      await this.refreshAccountsAfterOauth(auth.userId, [
        ...new Set([...oauthStartedChannels(history), ...recentConnects]),
      ]);
    }

    // Live state wins: reconcile the state with this turn's facts, then show
    // it to the model under the Live state block.
    let turnState = afterUser;
    const sessionBlockFor = (facts: LiveFacts | null) => {
      turnState = reconcile(afterUser, facts);
      return renderSessionState(turnState, {
        answeredAsk: resolution.matched ? resolution.ask : null,
        firstOption: resolution.firstOption,
        minimal: !facts,
      });
    };
    const context = session.ruleId
      ? await this.buildRuleAwareContext(
          session.ruleId,
          auth,
          userTexts,
          buildIntentText(history),
          !!opts.evalDryRun,
          keepTools,
          sessionBlockFor,
          // Preview before generate: start_generation shows its plan card until the user taps Start.
          { confirmed: !!confirmedChain?.has('start_generation') || startAffirmed, anyConfirmed: confirmedNow || startAffirmed },
          webSearchTexts(history),
        )
      : this.buildOnboardingContext(
          sessionId,
          auth,
          userTexts,
          sessionBlockFor(null),
          webSearchTexts(history),
          afterUser.goal?.kind === 'make_post',
        );
    const { brainPrompt, tools } = context;
    const facts: LiveFacts | null = 'facts' in context ? context.facts : null;
    const blankBrand = 'blankBrand' in context ? !!context.blankBrand : false;
    const brandChannels: string[] | undefined = 'brandChannels' in context ? context.brandChannels : undefined;
    const workflowNodes: Array<{ type?: unknown; lane?: unknown }> | null =
      'workflowNodes' in context && Array.isArray((context as { workflowNodes?: unknown }).workflowNodes)
        ? ((context as { workflowNodes: Array<{ type?: unknown; lane?: unknown }> }).workflowNodes)
        : null;
    const latestContentId = facts?.latestPost?.contentId;

    const useReasoning =
      this.config.get<string>('CHAT_USE_REASONING_MODEL') === 'true';
    const model = useReasoning
      ? this.llm.getReasoningChatModel()
      : this.llm.getChatModelForPlainText();

    const dryRun = this.config.get<string>('CHAT_EVAL_DRY_RUN') === 'true' || !!opts.evalDryRun;

    this.events.emitToChatSession(sessionId, 'chat:started', { sessionId });

    let loopResult: ToolCallingLoopResult;
    try {
      // Bare first greeting with no brand: fixed welcome + chips, no model call.
      const greeting =
        !session.ruleId && history.filter((m) => m.role === 'user').length === 1 && isBareGreeting(content)
          ? buildGreetingResult(content)
          : null;
      if (!greeting && !dryRun) {
        const remaining = await this.credits.getCreditsRemaining(auth.userId);
        if (remaining <= 0) {
          throw new InsufficientCreditsException({
            requiredCredits: 1,
            creditsRemaining: 0,
          });
        }
      }
      loopResult = greeting ?? await runToolCallingLoop({
        model,
        tools,
        messages: [new SystemMessage(brainPrompt), ...historyMessages],
        onStep: (step) =>
          this.events.emitToChatSession(sessionId, 'chat:step', {
            sessionId,
            step,
          }),
        // Not confirmed: show the confirmation card instead of running it.
        // CHAT_EVAL_DRY_RUN: generation tools answer "started" without
        // enqueuing anything (no image/text tokens spent) - eval runs only.
        planFirst: isMultiStepRequest(content),
        confirmedChain,
        // Soft per-round budgets: CHAT_MUTATIONS_PER_TURN changes and
        // CHAT_ITERATIONS_PER_ROUND model calls (reads are only bounded by the
        // latter), plus up to CHAT_CONTINUE_ROUNDS internal continue rounds
        // while planned changes remain and no human gate was hit.
        mutationLimit: CHAT_MUTATIONS_PER_TURN,
        maxIterations: CHAT_ITERATIONS_PER_ROUND,
        maxContinueRounds: CHAT_CONTINUE_ROUNDS,
        evaluateCompletion: ({ steps, ran }) => {
          const observations = steps
            .filter((s): s is Extract<typeof s, { type: 'observation' }> => s.type === 'observation')
            .map((s) => ({ name: s.name, result: s.result }));
          const toolNames = [
            ...new Set([
              ...ran,
              ...observations.map((o) => o.name),
            ]),
          ];
          // Yes -> willChange: this turn accepted a capability / start_post plan; those tools must run.
          const planTools = confirmedChain ? [...confirmedChain] : [];
          const missingPlan = planTools.filter((t) => !toolNames.includes(t));
          const started = observations.some(
            (o) =>
              o.name === 'start_generation' &&
              /"action"\s*:\s*"pipeline_started"/.test(o.result),
          );
          if (missingPlan.length > 0 && !started) {
            return {
              forceContinue: true as const,
              instruction:
                `${CONTINUE_INSTRUCTION_PREFIX} User accepted the capability plan. Do not ask them to wait. Run these tools now in order: ${missingPlan.join(', ')}. Then start_generation (with acceptGaps true if gaps remain).`,
              unmet: missingPlan,
            };
          }
          const verified = verifyGoalAcceptance({
            goalKind: turnState.goal?.kind,
            acceptance: turnState.goal?.acceptance,
            userText: content,
            toolNamesThisTurn: toolNames,
            observations,
            facts: facts
              ? {
                  hasDraft: !!facts.latestPost,
                  draftHasImage: !!facts.latestPost?.hasImage,
                  activeRun: !!facts.activeRun,
                  uploadChannels: facts.upload?.channels
                    .filter((c) => c.included)
                    .map((c) => c.channel),
                }
              : undefined,
          });
          if (!shouldForceContinueOnGoal(verified)) return null;
          return {
            forceContinue: true as const,
            instruction: goalContinueInstruction(verified.unmet),
            unmet: verified.unmet,
          };
        },
        guardToolCall: (name, args, turnSteps) => {
          if (name === 'ask_user') {
            const planArg =
              args && typeof args === 'object' && args.plan && typeof args.plan === 'object'
                ? (args.plan as { willChange?: string[]; notPossible?: string[] })
                : null;
            const opts = Array.isArray(args?.options)
              ? (args.options as Array<{ id?: string; label?: string }>)
              : [];
            const blocked = falseImpossibilityAskBlock({
              question: typeof args?.question === 'string' ? args.question : '',
              options: opts,
              plan: planArg
                ? {
                    willChange: planArg.willChange ?? [],
                    notPossible: planArg.notPossible ?? [],
                  }
                : null,
              nodes: workflowNodes,
              userText: content,
            });
            if (blocked) return blocked;
          }
          if (
            CONFIRMATION_REQUIRED_TOOL_NAMES.has(name) &&
            !confirmedNow &&
            !(waived && WAIVABLE_CONFIRMATION_TOOLS.has(name)) &&
            !matchesCarriedConfirmation(carried, name, args, { contentId: latestContentId }) &&
            !matchesApproval(turnState.approvals, name, args, { contentId: latestContentId })
          ) {
            return confirmationPromptFor(name, args);
          }
          if (name === 'update_rule') {
            const notAsked = unrequestedProfileChange(content, { args, waived, pendingPostText, brandChannels, blankBrand });
            if (notAsked) return notAsked;
          }
          if (ambiguousReply && MUTATING_TOOL_NAMES.has(name)) {
            return ambiguousChoiceObservation(content);
          }
          const planGuard =
            planBeforeSetupChange({ name, args, userText: content, confirmed: confirmedNow, brandChannels, waived }) ??
            startAfterSetupChange(name, turnSteps, confirmedNow || waived || (name === 'start_generation' && startAffirmed), { hadWorkflow: !!facts?.workflow, postIntent, userText: content });
          if (planGuard) return planGuard;
          const narrow =
            (name === 'start_generation' && !confirmedNow && !startAffirmed
              ? repeatedPostRequest(history) ??
                repeatedPostRequestInState(content, startedPostRequests(turnState))
              : null) ??
            saveBeforeRerunFinished(name, turnSteps) ??
            workflowAlreadyBuilt(name, turnSteps) ??
            draftChannelNotTemplate({
              name,
              userText: content,
              hasLatestPost: !!latestContentId,
              adaptBound: tools.some((t) => t.name === 'generate_more_adapt'),
              confirmed: confirmedNow,
              turnSteps,
            });
          if (narrow) return narrow;
          // start_generation handles dry-run itself (after validating the workflow).
          return dryRun && name !== 'start_generation' ? dryRunGenerationResult(name, args) : null;
        },
      });
    } catch (err) {
      this.events.emitToChatSession(sessionId, 'chat:failed', {
        sessionId,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    const { finalMessage, steps, usage, lastInputTokens } = loopResult;

    const answer =
      sanitizeReply(extractAiMessageText(finalMessage.content), {
        noWorkflow: !!facts && !facts.workflow,
      });
    // A failed turn throws above and writes no state; the next turn replays
    // its user row onto the last snapshot.
    // Leftover changes become a not_run chain the next "yes"/"continue" runs.
    const finalState = reconcile(
      reduceLoopOutcome(
        reduceTurnSteps(turnState, steps, { userText: content, now: Date.now() }),
        loopResult.outcome,
      ),
      facts,
    );

    const assistantMessage = withoutState(
      await this.messages.create({
        session: { connect: { sessionId } },
        role: 'assistant',
        content: answer,
        steps: steps.length > 0 ? (steps as Prisma.InputJsonValue) : undefined,
        state: finalState as unknown as Prisma.InputJsonValue,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      }),
    );
    await this.chargeChatUsage({
      auth,
      sessionId,
      messageId: assistantMessage.messageId,
      useReasoning,
      dryRun,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    const updatedSession =
      (await this.sessions.updateById(
        sessionId,
        { updatedAt: new Date() },
        auth,
      )) ?? session;

    this.events.emitToChatSession(sessionId, 'chat:completed', {
      sessionId,
      assistantMessage,
    });

    // Runs started this turn report back in this chat when they finish.
    for (const pipelineId of startedPipelineIdsFromSteps(steps).filter(
      (id) => !id.startsWith('dryrun-'),
    )) {
      void this.runFollowups
        ?.watch(sessionId, pipelineId, auth)
        .catch((err) =>
          this.logger.warn(
            `Could not link run ${pipelineId} to chat ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    const contextUsage: ContextUsage = {
      // Last call's prompt size = how full the context window is; summed usage is persisted above.
      used: lastInputTokens,
      limit: this.llm.getContextLimit(
        useReasoning ? this.llm.getReasoningModelId() : undefined,
      ),
    };

    return {
      userMessage,
      assistantMessage,
      contextUsage,
      session: updatedSession,
      // Eval-only (non-production header): lets the harness print the state.
      ...(opts.evalDryRun ? { evalDryRun: true, sessionState: finalState } : {}),
    };
  }

  /**
   * Automatic turn after a chat-started run ends. The caller must hold the
   * session's turn lock. The run result is injected as a synthetic
   * `pipeline_result` tool call + observation so the ReAct loop can inspect
   * the content (get_content) and explain failures. Read-only: mutating tools
   * are blocked.
   */
  async runPipelineFollowUp(
    sessionId: string,
    auth: TenancyAuth,
    pipelineId: string,
    observation: Record<string, unknown>,
  ): Promise<ChatMessageRecord> {
    const session = await this.getOwnedSession(sessionId, auth);
    const history = await this.messages.findBySessionId(sessionId, HISTORY_LIMIT);
    const userTexts = history.filter((m) => m.role === 'user').map((m) => m.content);
    const loadedState = readState(history).state;
    let followState = loadedState;
    const sessionBlockFor = (facts: LiveFacts | null) => {
      followState = reconcile(loadedState, facts);
      return renderSessionState(followState, { minimal: !facts });
    };
    const context = session.ruleId
      ? await this.buildRuleAwareContext(
          session.ruleId,
          auth,
          userTexts,
          buildIntentText(history),
          false,
          new Set(),
          sessionBlockFor,
          undefined,
          webSearchTexts(history),
        )
      : this.buildOnboardingContext(
          sessionId,
          auth,
          userTexts,
          sessionBlockFor(null),
          webSearchTexts(history),
          loadedState.goal?.kind === 'make_post',
        );
    const { brainPrompt, tools } = context;
    const facts: LiveFacts | null = 'facts' in context ? context.facts : null;
    const blankBrand = 'blankBrand' in context ? !!context.blankBrand : false;
    const brandChannels: string[] | undefined = 'brandChannels' in context ? context.brandChannels : undefined;

    const useReasoning =
      this.config.get<string>('CHAT_USE_REASONING_MODEL') === 'true';
    const model = useReasoning
      ? this.llm.getReasoningChatModel()
      : this.llm.getChatModelForPlainText();

    const toolCallId = `pipeline-result-${pipelineId}`;
    const resultText = JSON.stringify(observation);
    const syntheticSteps: AgentStep[] = [
      {
        type: 'action',
        name: PIPELINE_RESULT_TOOL_NAME,
        args: { pipelineId },
        toolCallId,
      },
      {
        type: 'observation',
        name: PIPELINE_RESULT_TOOL_NAME,
        toolCallId,
        result: resultText,
      },
    ];
    const injected: BaseMessage[] = [
      new AIMessage({
        content: '',
        tool_calls: [
          { id: toolCallId, name: PIPELINE_RESULT_TOOL_NAME, args: { pipelineId } },
        ],
      }),
      new ToolMessage({
        tool_call_id: toolCallId,
        name: PIPELINE_RESULT_TOOL_NAME,
        content: resultText,
      }),
    ];

    // Prefetch the finished draft so the chat UI always has a show_content card,
    // even if the model only writes "checking the draft" and skips get_content.
    const finishedContentId =
      typeof observation.contentId === 'string' && observation.contentId.trim()
        ? observation.contentId.trim()
        : null;
    if (observation.ok === true && finishedContentId && session.ruleId) {
      try {
        const row = await this.contents.findById(finishedContentId, auth);
        if (row && row.ruleRef === session.ruleId) {
          const catalog = await this.contentService.describeDraftNodes(
            finishedContentId,
            auth,
          );
          const showText = showContentPayload(previewFromRecord(row), {
            lanes: catalog.lanes,
            nodes: catalog.nodes,
          });
          const getToolCallId = `get-content-${pipelineId}`;
          syntheticSteps.push(
            {
              type: 'action',
              name: 'get_content',
              args: { contentId: finishedContentId },
              toolCallId: getToolCallId,
            },
            {
              type: 'observation',
              name: 'get_content',
              toolCallId: getToolCallId,
              result: showText,
            },
          );
          injected.push(
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: getToolCallId,
                  name: 'get_content',
                  args: { contentId: finishedContentId },
                },
              ],
            }),
            new ToolMessage({
              tool_call_id: getToolCallId,
              name: 'get_content',
              content: showText,
            }),
          );
        }
      } catch (err) {
        this.logger.warn(
          `Follow-up get_content prefetch for ${finishedContentId} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.events.emitToChatSession(sessionId, 'chat:started', {
      sessionId,
      followUp: true,
      pipelineId,
    });
    for (const step of syntheticSteps) {
      this.events.emitToChatSession(sessionId, 'chat:step', { sessionId, step });
    }

    let loopResult: ToolCallingLoopResult;
    try {
      loopResult = await runToolCallingLoop({
        model,
        // Follow-up: summarize the run result from the DB; only get_content, no errors from other tools.
        tools: tools.filter((t) => t.name === 'get_content'),
        skipClaimCheck: true,
        messages: [
          new SystemMessage(brainPrompt),
          ...toLangChainHistory(history),
          ...injected,
        ],
        maxIterations: 4,
        onStep: (step) =>
          this.events.emitToChatSession(sessionId, 'chat:step', {
            sessionId,
            step,
          }),
        guardToolCall: (name) =>
          MUTATING_TOOL_NAMES.has(name) ? FOLLOWUP_MUTATION_BLOCKED : null,
      });
    } catch (err) {
      this.events.emitToChatSession(sessionId, 'chat:failed', {
        sessionId,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const { finalMessage, steps, usage } = loopResult;
    const answer =
      sanitizeReply(extractAiMessageText(finalMessage.content), {
        noWorkflow: !!facts && !facts.workflow,
      });
    const allSteps = [...syntheticSteps, ...steps];
    // Marks the run announced; a card still waiting for the user's answer
    // (pending ask, approvals) is kept as it is.
    const finalState = reconcile(reduceFollowUp(followState, allSteps), facts);

    const assistantMessage = withoutState(
      await this.messages.create({
        session: { connect: { sessionId } },
        role: 'assistant',
        content: answer,
        steps: allSteps as Prisma.InputJsonValue,
        state: finalState as unknown as Prisma.InputJsonValue,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      }),
    );
    await this.chargeChatUsage({
      auth,
      sessionId,
      messageId: assistantMessage.messageId,
      useReasoning,
      dryRun: false,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    await this.sessions.updateById(sessionId, { updatedAt: new Date() }, auth);

    this.events.emitToChatSession(sessionId, 'chat:completed', {
      sessionId,
      assistantMessage,
      followUp: true,
      pipelineId,
    });
    return assistantMessage;
  }

  async getRunProgress(
    sessionId: string,
    pipelineId: string,
    auth: TenancyAuth,
  ): Promise<ChatRunProgress> {
    const session = await this.getOwnedSession(sessionId, auth);
    const snapshot = await this.orchestration.getPipeline(pipelineId, auth);
    if (!session.ruleId || snapshot.pipeline.ruleRef !== session.ruleId) {
      throw new NotFoundException(`Run ${pipelineId} not found in this chat`);
    }
    return buildRunProgress(sessionId, snapshot);
  }

  private async buildRuleAwareContext(
    ruleId: string,
    auth: TenancyAuth,
    userTexts: string[] = [],
    intentText?: string,
    evalDryRun = false,
    keepTools: ReadonlySet<string> = new Set(),
    sessionBlockFor?: (facts: LiveFacts) => string,
    previewGate?: { confirmed: boolean; anyConfirmed?: boolean },
    /** web_search results from earlier turns; URLs in them are trusted like user text. */
    priorSearchTexts: string[] = [],
  ) {
    // URL guard: the user's words plus anything web_search found (earlier or this turn).
    const searchTexts = [...priorSearchTexts];
    const urlTexts = () => [...userTexts, ...searchTexts];
    const rule = await this.ruleService.getRuleById(ruleId, auth);
    const assets = await this.ruleAssetService.listByRule(ruleId, auth);
    // Welcome "Start a new brand" shell: intake first; site assets also lift the gate.
    const blankBrand = shouldGateBlankBrand(rule as never, assets as never);
    const memories = await this.ruleMemoryService.listRecent(ruleId, auth);

    // Every rule-aware turn binds every tool's schema to the model, which is
    // real token cost regardless of whether the turn needs it. Pipeline and
    // content tools are meaningless before a workflow exists, so gate them
    // behind one cheap existence check instead of always paying for ~15 tool
    // schemas a brand-new brief has no use for yet.
    const workflow = await this.workflows
      .getWorkflowByRuleId(ruleId, auth)
      .catch(() => null);
    const hasWorkflow = workflow !== null;
    const { facts, text: liveState } = await this.buildLiveState(workflow, memories.length, auth);
    const sessionBlock = sessionBlockFor?.(facts) ?? '';
    const styleNote =
      memories.find((m) => /(style|watercolou?r|illustrat|look|colou?r|aesthetic)/i.test(String(m.body ?? '')))?.body ?? null;
    const brandChannels = ((rule as { channels?: unknown[] }).channels ?? []).map((c) => String((c as { channel?: unknown }).channel ?? c).toLowerCase());
    const attachedIds = attachedImageAssetIds(userTexts);
    const baseLanguage = normalizeLanguage((rule as { audience?: { language?: unknown } }).audience?.language) ?? 'en';
    // Upload media sources (default D): this brand's ready image assets only (chat attachments are saved as brand assets). No URLs, no other brands, no documents.
    const resolveUploadMedia: ResolveUploadMedia = async (ids) =>
      assets
        .filter(
          (a) =>
            ids.includes(String(a.ruleAssetId)) &&
            String(a.status) !== 'failed' &&
            String(a.type) !== 'guideline_document' &&
            Boolean(a.fileUrl || a.relativePath),
        )
        .map((a) => ({ assetId: String(a.ruleAssetId), url: String(a.fileUrl || a.relativePath) }));
    const capability = buildCapabilitySummary({
      brandName: rule.name,
      brandChannels,
      nodes: workflow ? (workflow.nodes as never) : null,
      activeRun: !!facts.workflow && !!facts.activeRun,
      // Just "content <id>, status â€¦" - the full Live state line is already above.
      latestDraft: latestDraftText(facts),
      styleNote,
      readyReferenceImages: assets.filter((a) => String(a.type) === 'reference_image' && String(a.status) === 'ready').length,
      attachedImages: attachedIds.length,
      baseLanguage,
    });
    const registry = buildRegistrySummary({
      nodes: workflow ? (workflow.nodes as never) : null,
      brandChannels,
      hasDraft: !!facts.latestPost,
      activeRun: !!facts.activeRun,
    });
    const brainPrompt = withReactInstructions(
      `${blankBrand ? `${BLANK_BRAND_PROMPT}\n\n` : ''}${buildRuleBrainPrompt(rule, assets, memories)}\n\n${liveState}${sessionBlock ? `\n\n${sessionBlock}` : ''}\n\n${capability}\n\n${registry}`,
    );
    const brandName = rule.name;

    const tools: StructuredToolInterface[] = [
      createSearchBrandAssetsTool(ruleId, this.ruleAssetSearchService),
      createGetRuleTool(ruleId, this.ruleService, auth),
      createListBrandAssetsTool(ruleId, this.ruleAssetService, auth),
      createRequestAssetUploadTool(),
      createUpdateRuleTool(ruleId, this.ruleService, auth),
      createIngestWebsiteContentTool(
        () => ruleId,
        this.ruleService,
        auth,
        urlTexts,
      ),
      createFetchWebsiteAssetsTool(
        () => ruleId,
        this.websiteAssetHandler,
        this.ruleAssetService,
        auth,
        urlTexts,
      ),
      createRememberTool(ruleId, this.ruleMemoryService, auth),
      createForgetTool(this.ruleMemoryService, auth),
      createForgetAllTool(ruleId, this.ruleMemoryService, auth),
      createSearchBrandMemoryTool(ruleId, this.ruleMemorySearchService, auth),
      createWebSearchTool(this.llm, (text) => searchTexts.push(text)),
      createAskUserTool({ blankBrand }),
      createListWorkflowsTool(ruleId, this.workflows, auth, brandName),
      createGenerateWorkflowTool(ruleId, this.workflows, auth, brandName),
      createApplyDefaultWorkflowTool(ruleId, this.workflows, auth, brandName),
      createListChannelsTool(
        ruleId,
        this.ruleService,
        this.mcpService,
        this.planChannelAccess,
        this.redNoteService,
        auth,
      ),
      createCheckChannelAuthTool(
        ruleId,
        this.ruleService,
        this.mcpService,
        this.planChannelAccess,
        this.redNoteService,
        auth,
      ),
      createStartChannelOauthTool(
        this.mcpService,
        this.redNoteService,
        auth,
      ),
      createListPostsTool(ruleId, this.postService, auth),
      createGetPostTool(this.postService, auth),
      createGetPostAnalyticsTool(this.postService, auth),
      createRetryPublishTool(ruleId, this.workflows, this.contents, this.uploadService, this.postService, auth),
      createSuggestRuleImprovementTool(
        ruleId,
        this.ruleService,
        this.postService,
        auth,
      ),
      createApplyRuleSuggestionTool(ruleId, this.ruleService, auth),
      // Always bound (intent-gated): with no workflow it sets the default one up first.
      createStartGenerationTool(
        ruleId,
        this.workflows,
        this.orchestration,
        auth,
        this.pipelines,
        {
          dryRun: this.config.get<string>('CHAT_EVAL_DRY_RUN') === 'true' || evalDryRun,
          styleNote,
          brandChannels,
          requestText: latestRequestText(userTexts),
          textOnlyRequest: TEXT_ONLY_REQUEST.test(userTexts.at(-1) ?? ''),
          attachedAssetIds: attachedIds,
          baseLanguage,
          loadReferenceAssets: async (ids) =>
            assets
              .filter((a) => ids.includes(String(a.ruleAssetId)) && String(a.status) !== 'failed' && (a.fileUrl || a.relativePath))
              .slice(0, 3)
              .map((a) => toImageAsset(a as never, 'product', 0.9)),
          // Option B: a first post with no workflow sets up the default one and starts.
          ...(hasWorkflow ? {} : { setupDefaultWorkflow: () => this.workflows.applyDefaultWorkflowStructure(ruleId, auth) }),
          ...(previewGate ? { previewGate } : {}),
          checkBrandReady: () => {
            const readinessInfo = getBrandReadiness(rule as never, assets as never);
            return {
              ready: readinessInfo.readiness === 'READY',
              reason: readinessInfo.reason,
            };
          },
        },
      ),
    ];

    if (hasWorkflow) {
      tools.push(
        createGetNodeConfigTool(ruleId, this.workflows, auth),
        createDescribeNodeConfigFieldsTool(ruleId, this.workflows, auth),
        createPreviewGenerationTool(ruleId, this.workflows, auth),
        createGetDraftMediaStatusTool(ruleId, this.workflows, this.contents, auth),
        createUpdateNodeConfigTool(
          ruleId,
          this.workflows,
          this.llm,
          auth,
          brandName,
        ),
        ...this.videoLookTools(ruleId, auth),
        createReorderWorkflowNodesTool(ruleId, this.workflows, auth, brandName),
        createRemoveWorkflowNodeTool(ruleId, this.workflows, auth, brandName),
        createAddWorkflowNodeTool(ruleId, this.workflows, auth, brandName),
        createSetWorkflowChannelsTool(ruleId, this.workflows, auth, brandName),
        createListPipelinesTool(ruleId, this.workflows, this.pipelines, auth),
        createGetActivePipelineTool(
          ruleId,
          this.workflows,
          this.pipelines,
          this.orchestration,
          auth,
        ),
        createGetPipelineStatusTool(
          ruleId,
          this.workflows,
          this.pipelines,
          this.orchestration,
          auth,
        ),
        createCancelPipelineTool(
          ruleId,
          this.workflows,
          this.pipelines,
          this.orchestration,
          auth,
        ),
        createGetPipelineLogsTool(
          ruleId,
          this.workflows,
          this.pipelines,
          this.orchestration,
          auth,
        ),
        createListContentsTool(ruleId, this.workflows, this.contents, auth),
        createGetContentTool(
          ruleId,
          this.workflows,
          this.contents,
          this.contentService,
          auth,
        ),
        createSaveContentTool(
          ruleId,
          this.workflows,
          this.contents,
          this.contentService,
          auth,
        ),
        createEditContentTool(ruleId, this.workflows, this.contents, this.contentService, auth),
        createApproveContentTool(
          ruleId,
          this.workflows,
          this.contents,
          this.contentService,
          auth,
        ),
        createRejectContentTool(
          ruleId,
          this.workflows,
          this.contents,
          this.contentService,
          auth,
        ),
        createRerunContentNodeTool(
          ruleId,
          this.workflows,
          this.contents,
          this.contentService,
          auth,
        ),
        createGenerateMoreImageTool({
          ruleId,
          workflowService: this.workflows,
          contents: this.contents,
          contentService: this.contentService,
          auth,
        }),
        createGenerateMoreTranslationTool({
          ruleId,
          workflowService: this.workflows,
          contents: this.contents,
          contentService: this.contentService,
          auth,
        }),
        createGenerateMoreSummaryTool({
          ruleId,
          workflowService: this.workflows,
          contents: this.contents,
          contentService: this.contentService,
          auth,
        }),
        createGenerateMoreAdaptTool({
          ruleId,
          workflowService: this.workflows,
          contents: this.contents,
          contentService: this.contentService,
          auth,
        }),
        createGeneratePresenterVideoTool({
          ruleId,
          workflowService: this.workflows,
          contents: this.contents,
          contentService: this.contentService,
          auth,
        }),
        createGenerateCinematicVideoTool({
          ruleId,
          workflowService: this.workflows,
          contents: this.contents,
          contentService: this.contentService,
          auth,
        }),
        createGetUploadTool(
          ruleId,
          this.workflows,
          this.contents,
          this.contentService,
          this.uploadService,
          auth,
        ),
        createPublishNowTool(
          ruleId,
          this.workflows,
          this.contents,
          this.contentService,
          this.uploadService,
          auth,
        ),
        createSchedulePublishTool(
          ruleId,
          this.workflows,
          this.contents,
          this.contentService,
          this.uploadService,
          auth,
        ),
        createPreviewUploadTool(ruleId, this.workflows, this.contents, this.uploadService, auth),
        createEditUploadChannelTool(ruleId, this.workflows, this.contents, this.uploadService, auth),
        createAddUploadMediaTool(ruleId, this.workflows, this.contents, this.uploadService, auth, resolveUploadMedia),
        createRemoveUploadMediaTool(ruleId, this.workflows, this.contents, this.uploadService, auth),
        createReschedulePublishTool(ruleId, this.workflows, this.contents, this.uploadService, auth),
        createCancelScheduleTool(ruleId, this.workflows, this.contents, this.uploadService, this.postService, auth),
      );
    }

    // Blank brand: generation/publish tools are unbound until intake fills it in.
    if (blankBrand) {
      for (let i = tools.length - 1; i >= 0; i--) {
        if (BLANK_BRAND_BLOCKED_TOOLS.has(tools[i].name)) tools.splice(i, 1);
      }
    }
    if (intentText === undefined) return { brainPrompt, tools, facts, brandChannels, workflowNodes: workflow ? (workflow.nodes as Array<{ type?: unknown; lane?: unknown }>) : null, blankBrand };
    // State gate + intent groups (~15 tools a turn instead of ~50), plus
    // whatever a pending confirmation / connect flow needs.
    const allowed = selectTurnTools(
      intentText,
      {
        hasWorkflow,
        hasContent: !!facts.latestPost,
        hasActiveRun: !!facts.workflow && !!facts.activeRun,
        brandReady: !blankBrand,
      },
      keepTools,
    );
    const gated = tools.filter((t) => allowed(t.name));
    this.logger.log(`Chat tools this turn: ${gated.length} of ${tools.length}`);
    return { brainPrompt, tools: gated, facts, brandChannels, workflowNodes: workflow ? (workflow.nodes as Array<{ type?: unknown; lane?: unknown }>) : null, blankBrand };
  }

  /**
   * Live state injected every turn so "show me the workflow" / "what's in
   * memory" answers come from the truth, not from notes or chat history.
   */
  private async buildLiveState(
    workflow: Awaited<ReturnType<WorkflowService['getWorkflowByRuleId']>>,
    memoryCount: number,
    auth: TenancyAuth,
  ): Promise<{ facts: LiveFacts; text: string }> {
    let runs: Awaited<ReturnType<typeof listPipelinesForWorkflow>> = [];
    const facts: LiveFacts = {
      workflow: null,
      activeRun: null,
      latestPost: null,
      upload: null,
      accounts: null,
      memoryCount,
      graph: buildWorkflowGraphSnapshot(null),
    };
    if (workflow) {
      facts.workflow = {
        status: String(workflow.workflow.status),
        steps: describeWorkflowSteps(workflow.nodes, workflow.edges ?? []),
      };
      facts.graph = buildWorkflowGraphSnapshot(
        workflow.nodes as never,
        String(workflow.workflow.status),
      );
      runs = await listPipelinesForWorkflow(this.pipelines, workflow.workflow.workflowId, auth).catch(() => []);
      const active = pickActivePipeline(runs);
      if (active) facts.activeRun = { pipelineId: active.pipelineId, status: String(active.status) };
      const latestRun = [...runs].sort((a, b) => +new Date(String((b as { createdAt?: unknown }).createdAt ?? 0)) - +new Date(String((a as { createdAt?: unknown }).createdAt ?? 0)))[0] ?? null;
      const row = latestRun ? await this.contents.findLatestByPipeline(latestRun.pipelineId, auth).catch(() => null) : null;
      if (row) {
        const p = previewFromRecord(row);
        facts.latestPost = { contentId: p.contentId, status: String(p.status), hasImage: !!p.hasImage };
        const upload = await this.uploadService
          .findUploadIdByContentRef(p.contentId, auth)
          .then((r) => this.uploadService.findByUploadId(r.uploadId, auth))
          .catch(() => null);
        if (upload) {
          facts.upload = {
            uploadId: upload.uploadId,
            status: String(upload.status),
            channels: upload.channels.map((c) => ({
              channel: String(c.channel),
              status: String(c.status),
              included: !!c.included,
            })),
          };
        }
      }
    }
    facts.accounts = await this.describeConnectedAccounts(auth.userId);
    return { facts, text: renderLiveState(facts) };
  }

  /**
   * Force-refresh the Zernio account list after an OAuth start, with one
   * short retry while a just-connected channel is not listed yet. Best
   * effort: failures leave the DB copy as it is.
   */
  private async refreshAccountsAfterOauth(userId: string, all: string[]): Promise<void> {
    // RedNote is not a Zernio account: after its QR, give the scan one short
    // wait if it has not landed yet (Live state reads its status right after).
    if (all.includes('rednote')) {
      const status = await this.redNoteService.getAccountStatus(userId).catch(() => null);
      if (status && !status.connected) await new Promise((r) => setTimeout(r, this.oauthRefreshRetryMs));
    }
    const channels = all.filter((c) => c !== 'rednote');
    if (!channels.length) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { accounts } = await this.mcpService.syncAccounts(userId);
        const listed = new Set(accounts.map((a) => a.channel.trim().toLowerCase()));
        if (channels.every((c) => listed.has(c))) return;
      } catch (err) {
        this.logger.warn(
          `Account refresh after OAuth failed for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, this.oauthRefreshRetryMs));
    }
  }

  /** Connected accounts for Live state; null when the lookup failed (line left out). */
  private async describeConnectedAccounts(userId: string): Promise<LiveFacts['accounts']> {
    try {
      const [{ accounts }, rednote] = await Promise.all([
        this.mcpService.getConnectedAccounts(userId),
        this.redNoteService.getAccountStatus(userId),
      ]);
      const parts: NonNullable<LiveFacts['accounts']> = accounts.map((a) => {
        const name = a.username?.trim();
        return { channel: a.channel, label: name ? `${a.channel} @${name}` : a.channel, connected: true };
      });
      if (rednote.connected) {
        parts.push({
          channel: 'rednote',
          label: rednote.handle ? `rednote @${rednote.handle}` : 'rednote',
          connected: true,
        });
      } else if (rednote.needsReauth) {
        parts.push({ channel: 'rednote', label: 'rednote needs_reauth', connected: false });
      }
      return parts;
    } catch {
      return null;
    }
  }

  private buildOnboardingContext(
    sessionId: string,
    auth: TenancyAuth,
    userTexts: string[] = [],
    sessionBlock = '',
    priorSearchTexts: string[] = [],
    hasPostGoal = false,
  ) {
    // URL guard: the user's words plus anything web_search found (earlier or this turn).
    const searchTexts = [...priorSearchTexts];
    const urlTexts = () => [...userTexts, ...searchTexts];
    const brainPrompt = withReactInstructions(
      sessionBlock ? `${buildOnboardingPrompt()}\n\n${sessionBlock}` : buildOnboardingPrompt(),
    );
    // create_rule_from_intake can bind a ruleId mid-turn â€” fetch_website_assets
    // reads this closure so it works later in the same turn, not just next time.
    let currentRuleId: string | null = null;

    const tools = [
      createCreateRuleFromIntakeTool(
        this.ruleService,
        auth,
        async (ruleId) => {
          currentRuleId = ruleId;
          await this.sessions.updateById(sessionId, { ruleId }, auth);
        },
        urlTexts,
        () => hasPostGoal,
      ),
      createIngestWebsiteContentTool(
        () => currentRuleId,
        this.ruleService,
        auth,
        urlTexts,
      ),
      createFetchWebsiteAssetsTool(
        () => currentRuleId,
        this.websiteAssetHandler,
        this.ruleAssetService,
        auth,
        urlTexts,
      ),
      createWebSearchTool(this.llm, (text) => searchTexts.push(text)),
      createAskUserTool(),
    ];

    return { brainPrompt, tools };
  }

  /**
   * Shadow log while state and the legacy history parsers both run: one line
   * when they disagree (state confirmed or kept tools the legacy parsers did not).
   */
  private logStateDiff(
    sessionId: string,
    state: ChatSessionState,
    d: {
      userConfirmed: boolean;
      stateConfirmed: boolean;
      carriedTool: string | null;
      legacyKeep: ReadonlySet<string>;
      keepTools: ReadonlySet<string>;
      source: 'stored' | 'bootstrap';
    },
  ): void {
    const addedKeep = [...d.keepTools].filter((t) => !d.legacyKeep.has(t));
    const approvalTools = state.approvals.map((a) => a.tool);
    const carriedMissing = !!d.carriedTool && !approvalTools.includes(d.carriedTool);
    if (d.userConfirmed === d.stateConfirmed && !addedKeep.length && !carriedMissing) return;
    this.logger.log(
      `chat.state.diff ${JSON.stringify({
        sessionId,
        turn: state.turn,
        source: d.source,
        confirm: { legacy: d.userConfirmed, state: d.stateConfirmed },
        carried: { legacy: d.carriedTool, stateApprovals: approvalTools },
        keepAddedByState: addedKeep,
      })}`,
    );
  }

  private async chargeChatUsage(args: {
    auth: TenancyAuth;
    sessionId: string;
    messageId: string;
    useReasoning: boolean;
    dryRun: boolean;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void> {
    if (args.dryRun) return;
    if (args.inputTokens <= 0 && args.outputTokens <= 0) return;
    const model = args.useReasoning
      ? this.llm.getReasoningModelId()
      : this.llm.getPlainTextModelId();
    try {
      await this.credits.chargeChatTurn({
        userId: args.auth.userId,
        sessionId: args.sessionId,
        messageId: args.messageId,
        model,
        provider: 'openai',
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
      });
    } catch (err) {
      this.logger.warn(
        `Chat credit charge failed for ${args.sessionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Bind a brand profile onto a ruleless onboarding session (e.g. after the
   * client bootstraps a Rule from attached files via /rules/extract).
   * No-op when the session already has this ruleId; refuses a different one.
   */
  async bindRuleToSession(sessionId: string, ruleId: string, auth: TenancyAuth) {
    const session = await this.getOwnedSession(sessionId, auth);
    if (session.ruleId && session.ruleId !== ruleId) {
      throw new BadRequestException(
        'This chat is already bound to a different brand profile',
      );
    }
    await this.ruleService.getRuleById(ruleId, auth);
    if (session.ruleId === ruleId) return session;
    const updated = await this.sessions.updateById(sessionId, { ruleId }, auth);
    return updated ?? { ...session, ruleId };
  }

  private async getOwnedSession(sessionId: string, auth: TenancyAuth) {
    const session = await this.sessions.findById(sessionId, auth);
    if (!session) {
      throw new NotFoundException(`Chat session ${sessionId} not found`);
    }
    return session;
  }
}


