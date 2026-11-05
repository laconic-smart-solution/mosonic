import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { CONTINUE_INSTRUCTION_PREFIX, parsePlanTools, planBudgetHint, runToolCallingLoop } from './tool-calling-loop';

function writeTool(name: string, impl?: () => Promise<string>) {
  const fn = jest.fn(impl ?? (async () => `${name}:done`));
  return { fn, tool: tool(fn, { name, description: `Mutating tool ${name}`, schema: z.object({}) }) };
}

function fakeModel(responses: AIMessage[], plan?: string) {
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
    invoke: async () => new AIMessage({ content: plan ?? '' }),
  } as unknown as BaseChatModel;
  return { model, seen };
}

const call = (name: string, id: string) => ({ name, args: {}, id });
const MUT = new Set(['a', 'b', 'c']);

describe('runToolCallingLoop continue rounds (Issue 4)', () => {
  it('parsePlanTools returns mentioned tools in plan order', () => {
    expect(parsePlanTools('1. call b\n2. then a_x? no: a\n3. c later', ['a', 'b', 'c', 'd'])).toEqual(['b', 'a', 'c']);
  });

  it('planBudgetHint follows mutationLimit, not a fixed "one change"', () => {
    expect(planBudgetHint(4, true)).toContain('Up to 4 changes');
    expect(planBudgetHint(4, true)).toContain('continue automatically');
    expect(planBudgetHint(1, false)).toContain('One change runs');
  });

  it('over-budget calls are notRun (not a stall) and run in an internal continue round', async () => {
    const [a, b, c] = ['a', 'b', 'c'].map((n) => writeTool(n));
    const { model, seen } = fakeModel([
      new AIMessage({ content: '', tool_calls: [call('a', '1'), call('b', '2'), call('c', '3')] }),
      new AIMessage({ content: 'Did a.' }),
      new AIMessage({ content: '', tool_calls: [call('b', '4')] }),
      new AIMessage({ content: 'Did b.' }),
      new AIMessage({ content: '', tool_calls: [call('c', '5')] }),
      new AIMessage({ content: 'All done.' }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [a.tool, b.tool, c.tool],
      messages: [new HumanMessage('do a b c')],
      mutatingToolNames: MUT,
      mutationLimit: 1,
      maxContinueRounds: 2,
    });
    expect(result.finalMessage.content).toBe('All done.');
    expect([a.fn, b.fn, c.fn].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    expect(result.outcome).toEqual({ ran: ['a', 'b', 'c'], failed: [], notRun: [], stopReason: 'answered', continueRounds: 2 });
    const cont = seen[2].at(-1) as HumanMessage;
    expect(String(cont.content).startsWith(CONTINUE_INSTRUCTION_PREFIX)).toBe(true);
    expect(String(cont.content)).toContain('b, c');
  });

  it('without continue rounds, leftovers are reported as notRun', async () => {
    const [a, b] = ['a', 'b'].map((n) => writeTool(n));
    const { model } = fakeModel([
      new AIMessage({ content: '', tool_calls: [call('a', '1'), call('b', '2')] }),
      new AIMessage({ content: 'Did a.' }),
    ]);
    const result = await runToolCallingLoop({
      model, tools: [a.tool, b.tool], messages: [new HumanMessage('go')], mutatingToolNames: MUT, mutationLimit: 1,
    });
    expect(b.fn).not.toHaveBeenCalled();
    expect(result.outcome).toMatchObject({ ran: ['a'], notRun: ['b'], stopReason: 'answered', continueRounds: 0 });
  });

  it('a reply that asks the user is a human gate: no continue round', async () => {
    const [a, b] = ['a', 'b'].map((n) => writeTool(n));
    const { model } = fakeModel([
      new AIMessage({ content: '', tool_calls: [call('a', '1'), call('b', '2')] }),
      new AIMessage({ content: 'Which channel should b use?' }),
    ]);
    const result = await runToolCallingLoop({
      model, tools: [a.tool, b.tool], messages: [new HumanMessage('go')], mutatingToolNames: MUT, mutationLimit: 1, maxContinueRounds: 2,
    });
    expect(b.fn).not.toHaveBeenCalled();
    expect(result.outcome).toMatchObject({ notRun: ['b'], stopReason: 'asked_in_text', continueRounds: 0 });
  });

  it('a confirmation_required block is a gate, not a failure, and is not carried', async () => {
    const [a, b] = ['a', 'b'].map((n) => writeTool(n));
    const { model } = fakeModel([
      new AIMessage({ content: '', tool_calls: [call('a', '1')] }),
      new AIMessage({ content: '', tool_calls: [call('b', '2')] }),
      new AIMessage({ content: 'Tap Yes to publish.' }),
    ]);
    const result = await runToolCallingLoop({
      model, tools: [a.tool, b.tool], messages: [new HumanMessage('go')], mutatingToolNames: MUT, mutationLimit: 4, maxContinueRounds: 2,
      guardToolCall: (name) => (name === 'b' ? JSON.stringify({ ok: false, code: 'confirmation_required', error: 'confirm' }) : null),
    });
    expect(result.outcome).toMatchObject({ ran: ['a'], failed: [], notRun: [], stopReason: 'confirmation' });
  });

  it('planFirst: planned tools that never ran are notRun; failed tools are not', async () => {
    const [a, b, c] = ['a', 'b', 'c'].map((n) => writeTool(n));
    const failing = writeTool('c', async () => JSON.stringify({ ok: false, code: 'boom', error: 'x' }));
    const { model, seen } = fakeModel(
      [
        new AIMessage({ content: '', tool_calls: [call('a', '1'), call('c', '2')] }),
        new AIMessage({ content: 'Did a; c failed.' }),
      ],
      '1. a\n2. c\n3. b',
    );
    const result = await runToolCallingLoop({
      model, tools: [a.tool, b.tool, failing.tool], messages: [new HumanMessage('go')], mutatingToolNames: MUT, mutationLimit: 4, planFirst: true,
    });
    expect(c.fn).not.toHaveBeenCalled();
    expect(result.outcome).toMatchObject({ ran: ['a'], failed: ['c'], notRun: ['b'] });
    const planMsg = seen[0].find((m) => m instanceof SystemMessage && String(m.content).includes('Private plan')) as SystemMessage;
    expect(String(planMsg.content)).toContain('Up to 4 changes');
    expect(String(planMsg.content)).not.toContain('Only one change runs per message');
  });

  it('injects "Still not done" into the final reply call only when stopping with leftovers', async () => {
    const [a, b] = ['a', 'b'].map((n) => writeTool(n));
    const { model, seen } = fakeModel([
      new AIMessage({ content: '', tool_calls: [call('a', '1'), call('b', '2')] }),
      new AIMessage({ content: 'Thought: hmm' }),
      new AIMessage({ content: 'Thought: hmm again' }),
      new AIMessage({ content: 'Did a, b is not done yet. Continue?' }),
    ]);
    const result = await runToolCallingLoop({
      model, tools: [a.tool, b.tool], messages: [new HumanMessage('go')], mutatingToolNames: MUT, mutationLimit: 1,
    });
    const last = seen.at(-1)!.at(-1) as HumanMessage;
    expect(String(last.content)).toContain('Still not done: b');
    expect(result.outcome?.notRun).toEqual(['b']);
  });
});