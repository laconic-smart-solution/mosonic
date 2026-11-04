import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { isAskUserObservation } from './ask-user.tool';
import { isOAuthStartObservation } from './channel.tools';
import { isContentMutationStopObservation } from './content-scope.util';
import { isPipelineStartedObservation } from './start-generation.tool';
import { extractAiMessageText } from './ai-message-text.util';
import { splitThoughtAndAnswer } from './split-thought.util';
import { fromHttpException, toolError } from './tool-error.util';
import { MUTATING_TOOL_NAMES } from './tool-guards.util';

export type AgentStep =
  | { type: 'thought'; text: string; durationMs?: number }
  | {
      type: 'action';
      name: string;
      args: Record<string, unknown>;
      toolCallId: string;
    }
  | {
      type: 'observation';
      name: string;
      toolCallId: string;
      result: string;
    }
  /** Legacy persisted shape (pre Thought/Action/Observation split). */
  | {
      type: 'tool_call';
      name: string;
      args: Record<string, unknown>;
      result: string;
    };

export type ToolCallingLoopUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type ToolCallingLoopResult = {
  finalMessage: AIMessage;
  messages: BaseMessage[];
  steps: AgentStep[];
  /** Summed across every model call (billing / persistence). */
  usage: ToolCallingLoopUsage;
  /** Input tokens of the last model call - how full the context window is now. */
  lastInputTokens: number;
  /** What the turn did with the changes it meant to make, and why it stopped. */
  /** Always set by runToolCallingLoop; absent on synthetic results (e.g. the greeting). */
  outcome?: ToolCallingLoopOutcome;
};

/**
 * Why the loop stopped. ask_user / oauth / confirmation / asked_in_text are
 * human gates: the turn waits for the user and never auto-continues.
 */
export type LoopStopReason =
  | 'answered'
  | 'asked_in_text'
  | 'ask_user'
  | 'oauth'
  | 'confirmation'
  | 'stop_action'
  | 'stall'
  | 'max_iterations';

export type ToolCallingLoopOutcome = {
  /** Mutating tools that ran OK this turn (in order, unique). */
  ran: string[];
  /** Mutating tools that ran or were blocked with an error (never carried forward). */
  failed: string[];
  /** Planned or budget-deferred mutating tools that never ran. */
  notRun: string[];
  stopReason: LoopStopReason;
  /** Internal continue rounds used (0 = single round). */
  continueRounds: number;
};

export const HUMAN_GATE_STOPS: ReadonlySet<LoopStopReason> = new Set<LoopStopReason>([
  'asked_in_text',
  'ask_user',
  'oauth',
  'confirmation',
]);

/** Prefix of the in-flight (never persisted) "keep going" message between rounds. */
export const CONTINUE_INSTRUCTION_PREFIX = '(Internal note, not from the user.)';

export function continueInstruction(notRun: readonly string[]): string {
  return `${CONTINUE_INSTRUCTION_PREFIX} The request is not finished. Still not done: ${notRun.join(', ')}. Continue now: call the next tool in plan order. If a step is ambiguous, needs the user's choice, or is risky (publish, connect an account, delete), use ask_user instead of guessing. If nothing is left to do, write the reply.`;
}

/** Plan hint added under the private plan; mirrors the per-round mutationLimit. */
export function planBudgetHint(mutationLimit: number, canContinue: boolean): string {
  const runs = mutationLimit === 1 ? 'One change runs' : `Up to ${mutationLimit} changes run`;
  const rest = canContinue
    ? 'the rest continue automatically in this same message'
    : 'then tell the user the next step';
  return `${runs} per step: do them in plan order; ${rest}. Stop and use ask_user when a step is ambiguous, needs the user's choice, or is risky (publish, connect an account, delete).`;
}

/** Mutating tool names a private plan mentions, in the order they first appear. */
export function parsePlanTools(plan: string, candidates: Iterable<string>): string[] {
  const hits: { name: string; at: number }[] = [];
  for (const name of candidates) {
    // Tool names are [a-z0-9_]; no regex escaping needed.
    const m = new RegExp(`(^|[^a-z0-9_])${name}(?![a-z0-9_])`, 'i').exec(plan);
    if (m) hits.push({ name, at: m.index });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name);
}

/** Observation returned for a mutating tool call over the turn's mutationLimit. */
export const ONE_MUTATION_PER_TURN_ERROR = toolError(
  'one_mutation_per_turn',
  'Not run yet: this step already used its change budget, so this change is queued. Do not call it again now and never mention limits. Write a short progress note of what was done; the remaining steps continue next (or ask the user with one ask_user chip if they need a choice). For several memories at once use forget_all (one change).',
);

/** Sent (not persisted) when the loop needs one more model call for the user-facing reply. */
export const FINAL_REPLY_INSTRUCTION =
  'Write your reply to the user now, based on the tool results above. Say what actually happened (past tense, e.g. "I started..." / "I approved...") and what they can do next. Do not describe a plan for something that already ran. Do not call tools. Do not start with "Thought:". Write it in the language of the user\'s latest message.';

/** Fallback when the stall detector ends the turn and the final reply call fails. */
export const STALL_REPLY =
  "I couldn't get that done: the same step kept failing, so I stopped instead of guessing. Tell me if you'd like me to try a different way.";

/** Key-order-independent JSON, so {a,b} and {b,a} count as the same call. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Error code of an ok:false observation, or null. */
export function observationErrorCode(result: string): string | null {
  try {
    const parsed = JSON.parse(result) as { ok?: unknown; code?: unknown };
    return parsed?.ok === false && typeof parsed.code === 'string' ? parsed.code : null;
  } catch {
    return null;
  }
}

export const PLAN_INSTRUCTION =
  'Do not answer the user yet. Write a short numbered plan (at most 5 lines) of the tool calls needed for their latest request, using only tools you have and the live state. Plan only, no other text.';


/** Sent once per turn when the model replied with only a Thought line. */
export const THOUGHT_ONLY_NUDGE =
  'Your last reply only had a Thought line and nothing for the user. Do it now: call the tool you described, or write the user-facing answer.';

const DEFAULT_FALLBACK_REPLY =
  "Sorry, I didn't finish that. Could you tell me again what you'd like me to do?";
const MAX_ITERATIONS_REPLY =
  "I ran out of steps for this message. Tell me what you'd like next and I'll continue.";

const STOP_FALLBACKS: Record<string, string> = {
  pipeline_started: 'Started. You can follow along below.',
  content_approved: 'Approved. The draft can now move to upload.',
  content_rejected: 'Rejected the draft.',
  content_rerun_started: 'Re-running it now. Watch the content card for the new version.',
  generate_more_started: 'Generating it now. Watch the content card.',
};

export type UserScript = 'th' | 'zh' | 'my' | null;

const LOCALIZED_STOP_FALLBACKS: Record<'th' | 'zh' | 'my', Record<string, string>> = {
  th: {
    pipeline_started: 'เริ่มแล้ว ดูความคืบหน้าได้ด้านล่าง',
  },
  my: { pipeline_started: 'စတင်ပါပြီ။ အောက်တွင် ကြည့်နိုင်ပါတယ်။' },
  zh: { pipeline_started: '已开始，可以在下方查看进度。' },
};

export function withLanguageHint(text: string, script: UserScript): string {
  if (script === 'th') return `${text} The user's latest message is in Thai, so reply in Thai.`;
  if (script === 'zh') return `${text} The user's latest message is in Chinese, so reply in Chinese.`;
  if (script === 'my') return `${text} The user's latest message is in Burmese, so reply in Burmese.`;
  return text;
}

/** Claims a full pipeline/post start — not image/caption re-runs ("started updating the image"). */
const STARTED_CLAIM =
  /\bi('ve| have)? (just )?started\b[^.]{0,40}\b(post|run|generat\w*|content)\b|\bstarted (your|the) (post|run)\b|^started\b/i;
/** "Done" / "I've noted" style claims; only trusted when a tool actually ran this turn. */
const CHANGE_CLAIM = /^(done\b|got it - i('ve| have) (saved|removed|updated)|i('ve| have) (noted|saved|removed|cleared|updated|deleted|added))/i;
const NOT_STARTED = /\b(get|getting|got)( you)? started\b|(hasn.t|has not|not yet|isn.t|wasn.t|already|couldn.t|can.t|didn.t) [^.]{0,20}started|not started/i;
const REAL_START_ACTIONS =
  /generate_more_started|content_rerun_started|pipeline_result|"action":"pipeline_started"/;

/**
 * Server-side check: the reply says a post was started but no start_generation
 * succeeded this turn. Replace it with the truth so the chat never fakes a run.
 * Re-runs / generate-more are real starts — do not rewrite those replies.
 */
export function correctFakeStartClaim(content: string, steps: AgentStep[]): string {
  const changed = steps.some((s) => s.type === 'observation' && !/^\s*\{"ok":false/.test(String((s as { result?: unknown }).result ?? '')) && !/^(Not run|Unknown tool|No memory found)/.test(String((s as { result?: unknown }).result ?? '')));
  if (!changed && CHANGE_CLAIM.test(content)) {
    return "I haven't changed anything yet. Tell me again and I'll do it once your brand profile is ready.";
  }
  if (!STARTED_CLAIM.test(content) || NOT_STARTED.test(content)) return content;
  // Pipeline, generate-more, or content re-run this turn is real state, not a claim.
  if (
    steps.some(
      (s) =>
        (s as { name?: string }).name === 'pipeline_result' ||
        (typeof (s as { result?: unknown }).result === 'string' &&
          REAL_START_ACTIONS.test((s as { result: string }).result)),
    )
  ) {
    return content;
  }
  const setUp = steps.some((s) => s.type === 'observation' && (s as { name?: string }).name === 'apply_default_workflow' && /"ok":true|show_workflow/.test(String((s as { result?: unknown }).result ?? '')));
  return setUp
    ? 'I set up your workflow, but the post has not started yet. Want me to start it now?'
    : "The post hasn't started yet. Want me to start it now?";
}

/** Script of the latest user message, for fallback replies the model did not write. */
export function latestUserScript(messages: BaseMessage[]): UserScript {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (
      m instanceof HumanMessage &&
      m.content !== FINAL_REPLY_INSTRUCTION &&
      m.content !== THOUGHT_ONLY_NUDGE &&
      !(typeof m.content === 'string' && m.content.startsWith(CONTINUE_INSTRUCTION_PREFIX))
    ) {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
      if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
      if (/[\u1000-\u109F]/.test(text)) return 'my';
      return null;
    }
  }
  return null;
}

function stopFallback(resultText: string, otherwise: string, script: UserScript = null): string {
  try {
    const parsed = JSON.parse(resultText) as { action?: unknown };
    if (typeof parsed.action === 'string' && STOP_FALLBACKS[parsed.action]) {
      const local = script ? LOCALIZED_STOP_FALLBACKS[script][parsed.action] : undefined;
      return local ?? STOP_FALLBACKS[parsed.action];
    }
  } catch {
    // not JSON
  }
  return otherwise;
}

function toolFailureObservation(err: unknown): string {
  const mapped = fromHttpException(err);
  if (mapped) return mapped;
  return toolError(
    'tool_failed',
    err instanceof Error ? err.message : String(err),
  );
}

function messageText(content: AIMessage['content']): string {
  return extractAiMessageText(content);
}

/**
 * Generic bind -> invoke -> dispatch -> ToolMessage -> invoke loop.
 * Not rule-specific — reusable as-is by the chat module.
 *
 * Records a ReAct-style trace: Thought (message content before tools),
 * Action (tool name + args), Observation (tool result). The final answer
 * is returned as `finalMessage`, not as a thought step.
 */
export async function runToolCallingLoop(params: {
  model: BaseChatModel;
  tools: StructuredToolInterface[];
  messages: BaseMessage[];
  maxIterations?: number;
  /** Invoked synchronously the moment each step is produced — for live (e.g. socket) emission. */
  onStep?: (step: AgentStep) => void;
  /** When true, stop the loop after this observation (e.g. image already rendered). */
  shouldStopObservation?: (result: string) => boolean;
  /** Tools counted against mutationLimit per turn (all model responses). Defaults to MUTATING_TOOL_NAMES. */
  mutatingToolNames?: ReadonlySet<string>;
  /** A plan the user confirmed: each of these may run once past the one-change limit. */
  confirmedChain?: ReadonlySet<string> | null;
  /** Soft max state changes per round (default 1). Each continue round gets a fresh budget. */
  mutationLimit?: number;
  /**
   * Extra internal rounds within one user message (default 0). A round ends
   * when the model writes a reply; if planned/deferred changes remain, no
   * human gate was hit and the round made progress, the loop continues with a
   * fresh mutation and iteration budget. maxIterations applies per round.
   */
  maxContinueRounds?: number;
  /** Pipeline follow-up turns: never rewrite the reply as a fake start claim. */
  skipClaimCheck?: boolean;
  /**
   * When the turn ends on a tool result, a Thought-only reply, or the
   * iteration cap, make one more model call for a result-based reply.
   * Default true.
   */
  finalReplyCall?: boolean;
  /**
   * Called before each tool runs. Return an observation string to block the
   * call (the tool is not invoked), or null to allow it.
   */
  /** Multi-step request: make one hidden planning call first (never shown or stored as a step). */
  planFirst?: boolean;
  guardToolCall?: (
    name: string,
    args: Record<string, unknown>,
    /** Steps recorded so far this turn (earlier observations included). */
    turnSteps: readonly AgentStep[],
  ) => string | null;
}): Promise<ToolCallingLoopResult> {
  const { model, tools, maxIterations = 6, onStep } = params;
  const messages = [...params.messages];
  const userScript = latestUserScript(messages);
  if (userScript && messages[0] instanceof SystemMessage && typeof messages[0].content === 'string') {
    messages[0] = new SystemMessage(withLanguageHint(messages[0].content, userScript));
  }
  const earlierNonLatin = !userScript && messages.some((m) => m instanceof HumanMessage && typeof m.content === 'string' && /[\u0E00-\u0E7F\u4E00-\u9FFF\u1000-\u109F]/.test(m.content));
  if (userScript || earlierNonLatin) {
    // Models drift to English on short non-Latin messages; tag the in-flight copy only (nothing persisted).
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m instanceof HumanMessage && typeof m.content === 'string') {
        const lang = userScript === 'th' ? 'Thai' : userScript === 'zh' ? 'Chinese' : userScript === 'my' ? 'Burmese' : 'English';
        messages[i] = new HumanMessage(`${m.content}\n\n(Reply in ${lang}.)`);
        break;
      }
    }
  }
  const steps: AgentStep[] = [];
  let lastMutationName: string | null = null;
  // Stall detector: identical call twice, or the same error code twice, ends tool use for this turn.
  const seenCalls = new Set<string>();
  const errorCodeCounts = new Map<string, number>();
  const usage: ToolCallingLoopUsage = { inputTokens: 0, outputTokens: 0 };
  let lastInputTokens = 0;
  const mutatingToolNames = params.mutatingToolNames ?? MUTATING_TOOL_NAMES;
  const finalReplyCall = params.finalReplyCall ?? true;

  if (!model.bindTools) {
    throw new Error('Model does not support tool calling (bindTools missing)');
  }
  const boundModel = model.bindTools(tools);
  const toolsByName = new Map(tools.map((t) => [t.name, t]));

  const pushStep = (step: AgentStep) => {
    steps.push(step);
    onStep?.(step);
  };

  const recordUsage = (response: AIMessage) => {
    if (!response.usage_metadata) return;
    usage.inputTokens += response.usage_metadata.input_tokens ?? 0;
    lastInputTokens = response.usage_metadata.input_tokens ?? 0;
    usage.outputTokens += response.usage_metadata.output_tokens ?? 0;
  };

  // Outcome tracking (mutating tools only).
  let intended: string[] = [];
  const ranTools: string[] = [];
  const failedTools: string[] = [];
  const deferredTools: string[] = [];
  const gatedTools: string[] = [];
  const pushUnique = (list: string[], name: string) => {
    if (!list.includes(name)) list.push(name);
  };
  const notRunNow = (): string[] =>
    [...new Set([...intended, ...deferredTools])].filter(
      (n) => toolsByName.has(n) && !ranTools.includes(n) && !failedTools.includes(n) && !gatedTools.includes(n),
    );
  let continueRounds = 0;
  const maxContinueRounds = Math.max(0, params.maxContinueRounds ?? 0);

  const done = (content: string, stopReason: LoopStopReason): ToolCallingLoopResult => ({
    finalMessage: new AIMessage({ content: params.skipClaimCheck ? content : correctFakeStartClaim(content, steps) }),
    messages,
    steps,
    usage,
    lastInputTokens,
    outcome: {
      ran: [...ranTools],
      failed: failedTools.filter((n) => !ranTools.includes(n)),
      notRun: notRunNow(),
      stopReason,
      continueRounds,
    },
  });

  /**
   * One extra model call (tools ignored) so the reply describes what the tools
   * actually did, instead of the pre-tool plan. Falls back to `fallback`.
   */
  const finalReply = async (fallback: string, stopReason: LoopStopReason): Promise<ToolCallingLoopResult> => {
    if (!finalReplyCall) return done(fallback, stopReason);
    // Leftovers only matter when the turn stops without a human gate already asking.
    const leftovers = HUMAN_GATE_STOPS.has(stopReason) ? [] : notRunNow();
    const instruction = leftovers.length
      ? `${FINAL_REPLY_INSTRUCTION} Still not done: ${leftovers.join(', ')}. Say plainly which of these are not done yet and ask if they want you to continue.`
      : FINAL_REPLY_INSTRUCTION;
    try {
      const response = (await boundModel.invoke([
        ...messages,
        new HumanMessage(withLanguageHint(instruction, latestUserScript(params.messages))),
      ])) as AIMessage;
      recordUsage(response);
      const { answer } = splitThoughtAndAnswer(messageText(response.content));
      if (answer) return done(answer, stopReason);
    } catch {
      // keep the fallback
    }
    return done(fallback, stopReason);
  };

  // Counted across the whole turn (every model response), not per response.
  let mutationsThisTurn = 0;
  const chainUsed = new Set<string>();
  let nudgedThoughtOnly = false;
  const mutationLimit = params.mutationLimit ?? 1;
  // A round made progress when at least one change ran OK in it.
  let progressThisRound = false;
  let roundStart = 0;

  if (params.planFirst) {
    try {
      const planResponse = (await model.invoke([
        ...messages,
        new HumanMessage(PLAN_INSTRUCTION),
      ])) as AIMessage;
      recordUsage(planResponse);
      const plan = messageText(planResponse.content).slice(0, 800);
      if (plan) {
        intended = parsePlanTools(plan, [...toolsByName.keys()].filter((n) => mutatingToolNames.has(n)));
        // In-flight only: the plan guides tool calls but is not a step and is not persisted.
        const lastHuman = messages.map((m) => m instanceof HumanMessage).lastIndexOf(true);
        messages.splice(Math.max(lastHuman, 0), 0, new SystemMessage(`Private plan for this request (never show, quote or mention it): \n${plan}\n${planBudgetHint(mutationLimit, maxContinueRounds > 0)}`));
      }
    } catch {
      // planning is optional
    }
  }

  for (let iteration = 0; iteration - roundStart < maxIterations; iteration++) {
    const startedAt = Date.now();
    const response = (await boundModel.invoke(messages)) as AIMessage;
    const durationMs = Date.now() - startedAt;
    messages.push(response);
    recordUsage(response);

    const toolCalls = response.tool_calls ?? [];
    const rawText = messageText(response.content);
    const parsed = splitThoughtAndAnswer(rawText);

    if (toolCalls.length === 0) {
      // No tool ran: no step is recorded, so the client shows only the reply.
      // A stray "Thought:" line from the model is dropped, never shown.
      if (parsed.answer) {
        // A reply that ends on a question is the model asking the user: a human gate.
        const asks = /[?\uFF1F]\s*$/.test(parsed.answer.trim());
        const leftovers = notRunNow();
        if (leftovers.length > 0 && !asks && gatedTools.length === 0 && progressThisRound && continueRounds < maxContinueRounds) {
          // Internal continue round: fresh soft budgets, same user message.
          continueRounds += 1;
          mutationsThisTurn = 0;
          nudgedThoughtOnly = false;
          progressThisRound = false;
          roundStart = iteration + 1;
          messages.push(new HumanMessage(continueInstruction(leftovers)));
          continue;
        }
        return done(parsed.answer, asks ? 'asked_in_text' : gatedTools.length > 0 ? 'confirmation' : 'answered');
      }

      // Thought-only (or empty) reply: never show the raw "Thought:" line.
      if (!nudgedThoughtOnly && iteration - roundStart < maxIterations - 1) {
        nudgedThoughtOnly = true;
        messages.push(new HumanMessage(THOUGHT_ONLY_NUDGE));
        continue;
      }
      return finalReply(parsed.thought || DEFAULT_FALLBACK_REPLY, 'answered');
    }

    // Only record a thought when the model actually wrote one alongside its
    // tool calls - never a synthetic "I'll use <tool>" filler line.
    const preToolText = parsed.thought || parsed.answer;
    if (preToolText) {
      pushStep({ type: 'thought', text: preToolText, durationMs });
    }

    // Providers expect a ToolMessage for every tool call in the response,
    // even ones we skip because the turn stopped early.
    const closeSkippedCalls = (fromIndex: number, reason: string) => {
      for (const skipped of toolCalls.slice(fromIndex)) {
        messages.push(
          new ToolMessage({
            tool_call_id: skipped.id ?? skipped.name,
            name: skipped.name,
            content: `Not run: ${reason}`,
          }),
        );
      }
    };

    for (const [callIndex, call] of toolCalls.entries()) {
      const toolCallId = call.id ?? call.name;
      pushStep({
        type: 'action',
        name: call.name,
        args: call.args ?? {},
        toolCallId,
      });

      const args = (call.args ?? {}) as Record<string, unknown>;
      const tool = toolsByName.get(call.name);
      let resultText: string;
      const callKey = `${call.name}:${stableStringify(args)}`;
      const repeatedCall = seenCalls.has(callKey);
      const inChain = !!params.confirmedChain?.has(call.name) && !chainUsed.has(call.name) && (lastMutationName === null || params.confirmedChain.has(lastMutationName));
      const overMutationLimit =
        !!tool &&
        mutatingToolNames.has(call.name) &&
        mutationsThisTurn >= mutationLimit &&
        !inChain &&
        // forget + remember is one "replace this note" change.
        !(call.name === 'remember' && lastMutationName === 'forget' && mutationsThisTurn === 1);
      // A deferred (over-budget) call did not run, so it may be called again next round.
      if (!overMutationLimit) seenCalls.add(callKey);
      let invokedMutation = false;
      if (repeatedCall && !overMutationLimit) {
        resultText = toolError('stalled', `${call.name} was already called with the same arguments this turn. Not run again.`);
      } else if (!tool) {
        resultText = `Unknown tool "${call.name}"`;
      } else if (overMutationLimit) {
        resultText = ONE_MUTATION_PER_TURN_ERROR;
        pushUnique(deferredTools, call.name);
      } else {
        const blocked = params.guardToolCall?.(call.name, args, steps) ?? null;
        if (blocked !== null) {
          resultText = blocked;
          if (mutatingToolNames.has(call.name)) {
            const code = observationErrorCode(blocked);
            if (code === 'confirmation_required' || isAskUserObservation(blocked)) pushUnique(gatedTools, call.name);
            else pushUnique(failedTools, call.name);
          }
        } else {
          invokedMutation = mutatingToolNames.has(call.name);
          if (mutatingToolNames.has(call.name)) {
            mutationsThisTurn += 1;
            lastMutationName = call.name;
            if (params.confirmedChain?.has(call.name)) chainUsed.add(call.name);
          }
          try {
            const result: unknown = await tool.invoke(args);
            resultText =
              typeof result === 'string' ? result : JSON.stringify(result);
          } catch (err) {
            // A thrown tool must not kill the turn - hand the error to the model.
            resultText = toolFailureObservation(err);
          }
        }
      }

      pushStep({
        type: 'observation',
        name: call.name,
        toolCallId,
        result: resultText,
      });
      messages.push(
        new ToolMessage({
          tool_call_id: toolCallId,
          name: call.name,
          content: resultText,
        }),
      );

      const errorCode = observationErrorCode(resultText);
      if (invokedMutation) {
        if (errorCode || /^(Not run|Unknown tool)/.test(resultText)) {
          if (errorCode === 'confirmation_required') pushUnique(gatedTools, call.name);
          else pushUnique(failedTools, call.name);
        } else {
          pushUnique(ranTools, call.name);
          progressThisRound = true;
        }
      }
      // A budget deferral is not a failure: it never counts toward the stall detector.
      if (errorCode && errorCode !== 'one_mutation_per_turn') errorCodeCounts.set(errorCode, (errorCodeCounts.get(errorCode) ?? 0) + 1);
      if (repeatedCall || (errorCode && (errorCodeCounts.get(errorCode) ?? 0) >= 2)) {
        closeSkippedCalls(callIndex + 1, 'the turn stopped: the same step kept failing.');
        return finalReply(STALL_REPLY, 'stall');
      }

      if (isAskUserObservation(resultText)) {
        closeSkippedCalls(callIndex + 1, 'waiting for the user to answer.');
        let question = '';
        try {
          const payload = JSON.parse(resultText) as { question?: string };
          if (payload.question) question = payload.question;
        } catch {
          // keep the model's answer
        }
        return done(question || parsed.answer || 'Please choose an option.', 'ask_user');
      }

      if (isOAuthStartObservation(resultText)) {
        closeSkippedCalls(callIndex + 1, 'waiting for the user to connect their account.');
        return done(
          parsed.answer ||
            'Connect your account with the button below, then tell me when you are back.',
          'oauth',
        );
      }

      if (
        isPipelineStartedObservation(resultText) ||
        isContentMutationStopObservation(resultText)
      ) {
        closeSkippedCalls(callIndex + 1, 'the turn stopped after this action.');
        return finalReply(stopFallback(resultText, 'Done. Watch the content card.', latestUserScript(params.messages)), 'stop_action');
      }

      if (params.shouldStopObservation?.(resultText)) {
        closeSkippedCalls(callIndex + 1, 'the turn stopped after this action.');
        return finalReply(stopFallback(resultText, resultText, latestUserScript(params.messages)), 'stop_action');
      }
    }
  }

  // Iteration cap reached right after tool observations: summarize results.
  return finalReply(MAX_ITERATIONS_REPLY, 'max_iterations');
}
