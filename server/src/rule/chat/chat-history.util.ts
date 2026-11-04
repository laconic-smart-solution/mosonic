import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { ChatMessageRecord } from '../../repositories/interfaces/chat-message.repository.interface';
import type { AgentStep } from '../tools/tool-calling-loop';

/**
 * How many recent assistant turns with tools get their observations replayed.
 * Older facts the model still needs (pending cards, approvals, what was done)
 * come from the server-kept Session state block instead.
 */
export const REPLAY_TOOL_ASSISTANT_LIMIT = 1;

/** Cap each replayed observation so history cannot swallow the context window. */
export const OBSERVATION_MAX_CHARS = 800;

export function parseAgentSteps(raw: unknown): AgentStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((step): step is AgentStep => {
    if (!step || typeof step !== 'object' || !('type' in step)) return false;
    const type = (step as { type: unknown }).type;
    return (
      type === 'thought' ||
      type === 'action' ||
      type === 'observation' ||
      type === 'tool_call'
    );
  });
}

export function expandLegacySteps(steps: AgentStep[]): AgentStep[] {
  const expanded: AgentStep[] = [];
  for (const step of steps) {
    if (step.type !== 'tool_call') {
      expanded.push(step);
      continue;
    }
    const toolCallId = step.name;
    expanded.push({
      type: 'action',
      name: step.name,
      args: step.args,
      toolCallId,
    });
    expanded.push({
      type: 'observation',
      name: step.name,
      toolCallId,
      result: step.result,
    });
  }
  return expanded;
}

export function truncateObservation(text: string, maxChars = OBSERVATION_MAX_CHARS): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}…`;
}

function hasToolTrace(steps: AgentStep[]): boolean {
  return steps.some(
    (step) =>
      step.type === 'action' ||
      step.type === 'observation' ||
      step.type === 'tool_call',
  );
}

function assistantTurnToMessages(message: ChatMessageRecord): BaseMessage[] {
  const steps = expandLegacySteps(parseAgentSteps(message.steps));
  const thoughts = steps
    .filter((step) => step.type === 'thought')
    .map((step) => step.text)
    .join('\n');
  const actions = steps.filter((step) => step.type === 'action');
  const observations = steps.filter((step) => step.type === 'observation');

  const toolCalls = actions.map((action, index) => ({
    name: action.name,
    args: action.args,
    id: action.toolCallId || `replay-${index}`,
  }));

  const out: BaseMessage[] = [
    new AIMessage({
      content: thoughts,
      tool_calls: toolCalls,
    }),
  ];

  for (let index = 0; index < observations.length; index++) {
    const observation = observations[index];
    const toolCallId =
      observation.toolCallId ||
      actions[index]?.toolCallId ||
      `replay-${index}`;
    out.push(
      new ToolMessage({
        tool_call_id: toolCallId,
        name: observation.name,
        content: truncateObservation(observation.result),
      }),
    );
  }

  if (message.content.trim()) {
    out.push(new AIMessage(message.content));
  }

  return out;
}

/**
 * Maps persisted chat rows into LangChain messages for the next turn.
 * User/assistant text is always included. Tool observations are replayed
 * only for the last {@link REPLAY_TOOL_ASSISTANT_LIMIT} assistant turns
 * that had tools, and each observation is truncated.
 */
export function toLangChainHistory(messages: ChatMessageRecord[]): BaseMessage[] {
  const toolTurnIndexes = messages
    .map((message, index) => ({ message, index }))
    .filter(
      ({ message }) =>
        message.role === 'assistant' && hasToolTrace(parseAgentSteps(message.steps)),
    )
    .map(({ index }) => index);
  const replayIndexes = new Set(toolTurnIndexes.slice(-REPLAY_TOOL_ASSISTANT_LIMIT));

  const out: BaseMessage[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === 'user') {
      out.push(new HumanMessage(message.content));
      continue;
    }
    if (!replayIndexes.has(index)) {
      out.push(new AIMessage(message.content));
      continue;
    }
    out.push(...assistantTurnToMessages(message));
  }
  return out;
}
