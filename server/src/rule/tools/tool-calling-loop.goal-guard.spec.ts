import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { CONTINUE_INSTRUCTION_PREFIX, runToolCallingLoop } from './tool-calling-loop';

function writeTool(name: string, impl?: () => Promise<string>) {
  const fn = jest.fn(impl ?? (async () => `${name}:done`));
  return { fn, tool: tool(fn, { name, description: `Mutating tool ${name}`, schema: z.object({}) }) };
}

function fakeModel(responses: AIMessage[]) {
  let call = 0;
  const seen: BaseMessage[][] = [];
  const bound = {
    invoke: async (msgs: BaseMessage[]) => {
      seen.push([...msgs]);
      const r = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return r;
    },
  };
  const model = {
    bindTools: () => bound,
    invoke: async () => new AIMessage({ content: '' }),
  } as unknown as BaseChatModel;
  return { model, seen };
}

const call = (name: string, id: string) => ({ name, args: {}, id });
const MUT = new Set(['update_rule', 'start_generation', 'add_workflow_node']);

describe('runToolCallingLoop goal evaluateCompletion guard', () => {
  it('forces continue when evaluateCompletion says goal unmet after setup-only', async () => {
    const update = writeTool('update_rule', async () =>
      JSON.stringify({ ok: true }),
    );
    const start = writeTool('start_generation', async () =>
      JSON.stringify({ ok: true, action: 'pipeline_started' }),
    );
    const { model, seen } = fakeModel([
      new AIMessage({
        content: '',
        tool_calls: [call('update_rule', '1')],
      }),
      new AIMessage({ content: 'Saved your preferences. All done!' }),
      new AIMessage({
        content: '',
        tool_calls: [call('start_generation', '2')],
      }),
      // start_generation stops via stop_action — final reply call
      new AIMessage({ content: 'Started your post.' }),
    ]);
    let forced = 0;
    const result = await runToolCallingLoop({
      model,
      tools: [update.tool, start.tool],
      messages: [new HumanMessage('Create a Facebook post with 4 images')],
      mutatingToolNames: MUT,
      mutationLimit: 4,
      maxContinueRounds: 2,
      evaluateCompletion: () => {
        forced += 1;
        if (forced > 1) return null;
        return {
          forceContinue: true as const,
          instruction: `${CONTINUE_INSTRUCTION_PREFIX} Goal not complete. Still unmet: 4 images. Continue with start_generation.`,
        };
      },
    });
    expect(forced).toBeGreaterThanOrEqual(1);
    expect(update.fn).toHaveBeenCalled();
    expect(start.fn).toHaveBeenCalled();
    expect(result.outcome?.continueRounds).toBeGreaterThanOrEqual(1);
    const cont = seen.find((msgs) =>
      msgs.some(
        (m) =>
          m instanceof HumanMessage &&
          String(m.content).includes('Goal not complete'),
      ),
    );
    expect(cont).toBeTruthy();
  });

  it('does not force continue when evaluateCompletion returns null (preference-only)', async () => {
    const update = writeTool('update_rule', async () =>
      JSON.stringify({ ok: true }),
    );
    const { model } = fakeModel([
      new AIMessage({
        content: '',
        tool_calls: [call('update_rule', '1')],
      }),
      new AIMessage({ content: 'Saved your style preference.' }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [update.tool],
      messages: [new HumanMessage('Remember I like watercolor')],
      mutatingToolNames: MUT,
      mutationLimit: 4,
      maxContinueRounds: 2,
      evaluateCompletion: () => null,
    });
    expect(result.outcome?.stopReason).toBe('answered');
    expect(result.outcome?.continueRounds).toBe(0);
    expect(result.finalMessage.content).toMatch(/Saved your style/i);
  });
});
