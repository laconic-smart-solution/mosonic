import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { runToolCallingLoop, stableStringify, observationErrorCode } from './tool-calling-loop';
import { TOOL_ERROR_NEXT, toolError, fromHttpException } from './tool-error.util';
import { HttpException } from '@nestjs/common';

/** Bound model replays responses; the unbound final-reply call answers "honest". */
function model(responses: AIMessage[]): { m: BaseChatModel; boundCalls: () => number } {
  let call = 0;
  const bound = { invoke: async () => responses[Math.min(call++, responses.length - 1)] };
  return {
    m: { bindTools: () => bound, invoke: async () => new AIMessage({ content: 'honest' }) } as unknown as BaseChatModel,
    boundCalls: () => call,
  };
}

const lookup = (impl: () => Promise<string>) =>
  tool(impl, { name: 'lookup', description: 'x', schema: z.object({ id: z.string(), n: z.number().optional() }) });

describe('stall detector', () => {
  it('stops when the same tool is called twice with identical args (any key order)', async () => {
    const impl = jest.fn(async () => 'fine');
    const { m, boundCalls } = model([
      new AIMessage({ content: '', tool_calls: [{ name: 'lookup', args: { id: 'a', n: 1 }, id: 'c1' }] }),
      new AIMessage({ content: '', tool_calls: [{ name: 'lookup', args: { n: 1, id: 'a' }, id: 'c2' }] }),
      new AIMessage({ content: 'honest' }),
    ]);
    const result = await runToolCallingLoop({ model: m, tools: [lookup(impl)], messages: [new HumanMessage('go')] });
    expect(impl).toHaveBeenCalledTimes(1);
    expect(boundCalls()).toBe(3); // two tool rounds + the final no-tool reply
    expect(result.steps.some((s) => s.type === 'observation' && /"code":"stalled"/.test((s as { result: string }).result))).toBe(true);
    expect(result.finalMessage.content).toBe('honest');
  });

  it('stops when the same error code comes back twice', async () => {
    const impl = jest.fn(async () => toolError('not_found', 'nope'));
    const { m } = model([
      new AIMessage({ content: '', tool_calls: [{ name: 'lookup', args: { id: 'a' }, id: 'c1' }] }),
      new AIMessage({ content: '', tool_calls: [{ name: 'lookup', args: { id: 'b' }, id: 'c2' }] }),
      new AIMessage({ content: 'honest' }),
    ]);
    const result = await runToolCallingLoop({ model: m, tools: [lookup(impl)], messages: [new HumanMessage('go')] });
    expect(impl).toHaveBeenCalledTimes(2);
    expect(result.finalMessage.content).toBe('honest');
  });

  it('keeps going after one error with a different follow-up', async () => {
    let n = 0;
    const impl = jest.fn(async () => (n++ === 0 ? toolError('not_found', 'nope') : 'ok'));
    const { m } = model([
      new AIMessage({ content: '', tool_calls: [{ name: 'lookup', args: { id: 'a' }, id: 'c1' }] }),
      new AIMessage({ content: '', tool_calls: [{ name: 'lookup', args: { id: 'b' }, id: 'c2' }] }),
      new AIMessage({ content: 'found it' }),
    ]);
    const result = await runToolCallingLoop({ model: m, tools: [lookup(impl)], messages: [new HumanMessage('go')] });
    expect(impl).toHaveBeenCalledTimes(2);
    expect(result.finalMessage.content).toBe('found it');
  });

  it('helpers', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 0 }] })).toBe('{"a":[2,{"c":0,"d":1}],"b":1}');
    expect(observationErrorCode('{"ok":false,"code":"x"}')).toBe('x');
    expect(observationErrorCode('plain')).toBeNull();
  });
});

describe('tool error next hints', () => {
  it('adds a next hint per code', () => {
    const parsed = JSON.parse(toolError('no_workflow', 'none'));
    expect(parsed.next).toBe(TOOL_ERROR_NEXT.no_workflow);
    expect(JSON.parse(toolError('insufficient_credits', 'x')).next).toMatch(/top up/);
    expect(JSON.parse(toolError('some_new_code', 'x')).next).toBeUndefined();
  });
  it('maps external 429, 402 and 4xx errors', () => {
    expect(JSON.parse(fromHttpException(new HttpException('slow down', 429))!).code).toBe('rate_limited');
    expect(JSON.parse(fromHttpException(new HttpException('Not enough credits', 402))!).code).toBe('insufficient_credits');
    expect(JSON.parse(fromHttpException(new HttpException('nope', 409))!).code).toBe('external_error');
    expect(JSON.parse(fromHttpException(new Error('Not enough credits to run'))!).code).toBe('insufficient_credits');
  });
});
