import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { ChatMessageRecord } from '../../repositories/interfaces/chat-message.repository.interface';
import {
  expandLegacySteps,
  OBSERVATION_MAX_CHARS,
  REPLAY_TOOL_ASSISTANT_LIMIT,
  toLangChainHistory,
  truncateObservation,
} from './chat-history.util';

function row(
  partial: Pick<ChatMessageRecord, 'role' | 'content'> &
    Partial<Pick<ChatMessageRecord, 'steps'>>,
): ChatMessageRecord {
  return {
    messageId: 'm',
    sessionId: 's',
    createdAt: new Date(),
    inputTokens: null,
    outputTokens: null,
    steps: null,
    ...partial,
  };
}

describe('chat-history.util', () => {
  it('maps user/assistant text only when there is no tool trace', () => {
    const mapped = toLangChainHistory([
      row({ role: 'user', content: 'hi' }),
      row({ role: 'assistant', content: 'hello' }),
    ]);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toBeInstanceOf(HumanMessage);
    expect(mapped[1]).toBeInstanceOf(AIMessage);
    expect((mapped[1] as AIMessage).content).toBe('hello');
  });

  it('replays thought, action, truncated observation, then the final answer', () => {
    const longResult = 'x'.repeat(OBSERVATION_MAX_CHARS + 50);
    const mapped = toLangChainHistory([
      row({ role: 'user', content: 'search please' }),
      row({
        role: 'assistant',
        content: 'Here is what I found.',
        steps: [
          { type: 'thought', text: 'Need brand docs.' },
          {
            type: 'action',
            name: 'search_brand_assets',
            args: { query: 'tone' },
            toolCallId: 'call-1',
          },
          {
            type: 'observation',
            name: 'search_brand_assets',
            toolCallId: 'call-1',
            result: longResult,
          },
        ],
      }),
    ]);

    expect(mapped[0]).toBeInstanceOf(HumanMessage);
    expect(mapped[1]).toBeInstanceOf(AIMessage);
    expect((mapped[1] as AIMessage).content).toBe('Need brand docs.');
    expect((mapped[1] as AIMessage).tool_calls?.[0]).toEqual(
      expect.objectContaining({
        name: 'search_brand_assets',
        id: 'call-1',
      }),
    );
    expect(mapped[2]).toBeInstanceOf(ToolMessage);
    expect((mapped[2] as ToolMessage).content).toBe(truncateObservation(longResult));
    expect((mapped[2] as ToolMessage).content.length).toBeLessThanOrEqual(
      OBSERVATION_MAX_CHARS + 1,
    );
    expect(mapped[3]).toBeInstanceOf(AIMessage);
    expect((mapped[3] as AIMessage).content).toBe('Here is what I found.');
  });

  it('only replays tools for the last assistant turn that used them (REPLAY_TOOL_ASSISTANT_LIMIT)', () => {
    const toolTurn = (n: number): ChatMessageRecord =>
      row({
        role: 'assistant',
        content: `answer ${n}`,
        steps: [
          { type: 'thought', text: `t${n}` },
          {
            type: 'action',
            name: 'web_search',
            args: { query: String(n) },
            toolCallId: `c${n}`,
          },
          {
            type: 'observation',
            name: 'web_search',
            toolCallId: `c${n}`,
            result: `obs ${n}`,
          },
        ],
      });

    const mapped = toLangChainHistory([
      row({ role: 'user', content: 'q1' }),
      toolTurn(1),
      row({ role: 'user', content: 'q2' }),
      toolTurn(2),
      row({ role: 'user', content: 'q3' }),
      toolTurn(3),
    ]);

    const toolMessages = mapped.filter((m) => m instanceof ToolMessage);
    expect(REPLAY_TOOL_ASSISTANT_LIMIT).toBe(1);
    expect(toolMessages).toHaveLength(1);
    expect((toolMessages[0] as ToolMessage).content).toBe('obs 3');
    // Older turns keep their text; only the observations are dropped.
    expect(mapped.some((m) => m instanceof AIMessage && m.content === 'answer 1')).toBe(
      true,
    );
    expect(mapped.some((m) => m instanceof AIMessage && m.content === 'answer 2')).toBe(
      true,
    );
  });

  it('expands legacy tool_call steps into action + observation', () => {
    const expanded = expandLegacySteps([
      {
        type: 'tool_call',
        name: 'echo',
        args: { value: 'hi' },
        result: 'echo:hi',
      },
    ]);
    expect(expanded.map((s) => s.type)).toEqual(['action', 'observation']);
  });
});
