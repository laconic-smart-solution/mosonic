import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { NotFoundException } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createAskUserTool } from './ask-user.tool';
import {
  FINAL_REPLY_INSTRUCTION,
  ONE_MUTATION_PER_TURN_ERROR,
  THOUGHT_ONLY_NUDGE,
  runToolCallingLoop,
  type AgentStep,
} from './tool-calling-loop';

const echoTool = tool(async ({ value }: { value: string }) => `echo:${value}`, {
  name: 'echo',
  description: 'Echoes back the given value.',
  schema: z.object({ value: z.string() }),
});

function fakeModel(invokeResponses: AIMessage[]): BaseChatModel {
  let call = 0;
  const bound = {
    invoke: async () => {
      const response =
        invokeResponses[Math.min(call, invokeResponses.length - 1)];
      call += 1;
      return response;
    },
  };
  return {
    bindTools: () => bound,
  } as unknown as BaseChatModel;
}

function actionSteps(steps: AgentStep[]) {
  return steps.filter((s) => s.type === 'action');
}

describe('runToolCallingLoop', () => {
  it('records Thought, Action, Observation and feeds the result back', async () => {
    const model = fakeModel([
      new AIMessage({
        content: 'Need to echo first.',
        tool_calls: [{ name: 'echo', args: { value: 'hi' }, id: 'call-1' }],
      }),
      new AIMessage({ content: 'done' }),
    ]);

    const result = await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('go')],
    });

    expect(result.finalMessage.content).toBe('done');
    expect(result.steps).toEqual([
      {
        type: 'thought',
        text: 'Need to echo first.',
        durationMs: expect.any(Number),
      },
      {
        type: 'action',
        name: 'echo',
        args: { value: 'hi' },
        toolCallId: 'call-1',
      },
      {
        type: 'observation',
        name: 'echo',
        toolCallId: 'call-1',
        result: 'echo:hi',
      },
    ]);
  });

  it('drops a stray Thought line and records no step when no tools are used', async () => {
    const model = fakeModel([
      new AIMessage({
        content: 'Thought: Brand brief is enough.\n\nHere is the post.',
      }),
    ]);

    const result = await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('go')],
    });

    expect(result.finalMessage.content).toBe('Here is the post.');
    expect(result.steps).toEqual([]);
  });

  it('records no filler Thought for a direct answer (client hides the step box)', async () => {
    const model = fakeModel([new AIMessage({ content: 'no tools needed' })]);

    const result = await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('go')],
    });

    expect(result.finalMessage.content).toBe('no tools needed');
    expect(result.steps).toEqual([]);
  });

  it('unwraps Responses API text parts into a plain reply', async () => {
    const model = fakeModel([
      new AIMessage({
        content: [
          {
            type: 'text',
            text: 'I started adapting the current post for Instagram.',
            annotations: [],
            phase: 'final_answer',
          },
        ],
      }),
    ]);

    const result = await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('add instagram')],
      skipClaimCheck: true,
    });

    expect(result.finalMessage.content).toBe(
      'I started adapting the current post for Instagram.',
    );
  });

  it('records no synthetic Thought when the model calls a tool with empty content', async () => {
    const model = fakeModel([
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'echo', args: { value: 'hi' }, id: 'call-1' }],
      }),
      new AIMessage({ content: 'done' }),
    ]);

    const result = await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('go')],
    });

    expect(result.steps.map((s) => s.type)).toEqual(['action', 'observation']);
  });

  it('accumulates usage across iterations', async () => {
    const model = fakeModel([
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'echo', args: { value: 'hi' }, id: 'call-1' }],
        usage_metadata: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
        },
      }),
      new AIMessage({
        content: 'done',
        usage_metadata: {
          input_tokens: 20,
          output_tokens: 8,
          total_tokens: 28,
        },
      }),
    ]);

    const result = await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('go')],
    });

    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 13 });
  });

  it('invokes onStep synchronously as each step is produced', async () => {
    const model = fakeModel([
      new AIMessage({
        content: 'checking',
        tool_calls: [{ name: 'echo', args: { value: 'hi' }, id: 'call-1' }],
      }),
      new AIMessage({ content: 'done' }),
    ]);
    const seen: AgentStep[] = [];

    await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('go')],
      onStep: (step) => seen.push(step),
    });

    expect(seen.map((s) => s.type)).toEqual([
      'thought',
      'action',
      'observation',
    ]);
    expect(seen[0]).toEqual({
      type: 'thought',
      text: 'checking',
      durationMs: expect.any(Number),
    });
  });

  it('stops at maxIterations even if the model keeps requesting tool calls', async () => {
    const alwaysToolCall = new AIMessage({
      content: '',
      tool_calls: [{ name: 'echo', args: { value: 'loop' }, id: 'call-x' }],
    });
    const model = fakeModel([alwaysToolCall]);

    const result = await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('go')],
      maxIterations: 2,
    });

    expect(actionSteps(result.steps)).toHaveLength(2);
  });

  it('reports an unknown tool name without throwing', async () => {
    const model = fakeModel([
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'nonexistent', args: {}, id: 'call-2' }],
      }),
      new AIMessage({ content: 'handled' }),
    ]);

    const result = await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('go')],
    });

    const observation = result.steps.find((s) => s.type === 'observation');
    expect(observation?.type).toBe('observation');
    if (observation?.type === 'observation') {
      expect(observation.result).toContain('Unknown tool');
    }
    expect(result.finalMessage.content).toBe('handled');
  });

  it('stops after ask_user and does not run later tools in the same turn', async () => {
    const model = fakeModel([
      new AIMessage({
        content: 'Thought: Need a decision.\n\nCreate the profile?',
        tool_calls: [
          {
            name: 'ask_user',
            args: { type: 'yes_no', question: 'Create the profile?' },
            id: 'ask-1',
          },
          { name: 'echo', args: { value: 'should-not-run' }, id: 'echo-1' },
        ],
      }),
    ]);

    const result = await runToolCallingLoop({
      model,
      tools: [createAskUserTool(), echoTool],
      messages: [new HumanMessage('go')],
    });

    expect(
      actionSteps(result.steps).map((s) => (s.type === 'action' ? s.name : '')),
    ).toEqual(['ask_user']);
    expect(result.finalMessage.content).toContain('Create the profile?');
  });

  it('stops after start_oauth and does not run later tools in the same turn', async () => {
    const oauthTool = tool(
      async () =>
        JSON.stringify({
          ok: true,
          action: 'start_oauth',
          platform: 'tiktok',
          connectUrl: 'https://zernio.example/connect',
        }),
      {
        name: 'start_channel_oauth',
        description: 'oauth',
        schema: z.object({}),
      },
    );
    const model = fakeModel([
      new AIMessage({
        content: 'Connect TikTok',
        tool_calls: [
          { name: 'start_channel_oauth', args: {}, id: 'oauth-1' },
          { name: 'echo', args: { value: 'should-not-run' }, id: 'echo-1' },
        ],
      }),
    ]);

    const result = await runToolCallingLoop({
      model,
      tools: [oauthTool, echoTool],
      messages: [new HumanMessage('connect tiktok')],
    });

    expect(
      actionSteps(result.steps).map((s) => (s.type === 'action' ? s.name : '')),
    ).toEqual(['start_channel_oauth']);
  });

  it('stops after pipeline_started and does not run later tools in the same turn', async () => {
    const startTool = tool(
      async () =>
        JSON.stringify({
          ok: true,
          action: 'pipeline_started',
          pipelineId: 'pipe-1',
          workflowId: 'wf-1',
          status: 'running',
        }),
      {
        name: 'start_generation',
        description: 'start',
        schema: z.object({}),
      },
    );

    const model = fakeModel([
      new AIMessage({
        content: 'Thought: Starting the run.',
        tool_calls: [
          { name: 'start_generation', args: {}, id: 'start-1' },
          { name: 'echo', args: { value: 'should-not-run' }, id: 'echo-1' },
        ],
      }),
    ]);

    const result = await runToolCallingLoop({
      model,
      tools: [startTool, echoTool],
      messages: [new HumanMessage('go')],
    });

    expect(
      actionSteps(result.steps).map((s) => (s.type === 'action' ? s.name : '')),
    ).toEqual(['start_generation']);
    // The final reply comes from one more model call; this fake repeats the
    // Thought-only message, so the result-based fallback is used instead.
    expect(result.finalMessage.content).toBe(
      'Started. You can follow along below.',
    );
  });

  it('allows another tool after generate_more_started in the same turn', async () => {
    const moreTool = tool(
      async () =>
        JSON.stringify({
          ok: true,
          action: 'generate_more_started',
          contentId: 'c-1',
          pendingNodeId: 'n-1',
        }),
      {
        name: 'generate_more_image',
        description: 'more',
        schema: z.object({}),
      },
    );

    const model = fakeModel([
      new AIMessage({
        content: 'Thought: Extra image then echo.',
        tool_calls: [
          { name: 'generate_more_image', args: {}, id: 'more-1' },
          { name: 'echo', args: { value: 'also-ran' }, id: 'echo-1' },
        ],
      }),
      new AIMessage({ content: 'Done both.' }),
    ]);

    const result = await runToolCallingLoop({
      model,
      tools: [moreTool, echoTool],
      messages: [new HumanMessage('another image')],
    });

    expect(
      actionSteps(result.steps).map((s) => (s.type === 'action' ? s.name : '')),
    ).toEqual(['generate_more_image', 'echo']);
  });

  it('stops when shouldStopObservation matches', async () => {
    const paint = tool(
      async () => JSON.stringify({ ok: true, action: 'image_generated' }),
      { name: 'generate_image', description: 'paint', schema: z.object({}) },
    );
    const model = fakeModel([
      new AIMessage({
        content: 'Thought: Paint.',
        tool_calls: [
          { name: 'generate_image', args: {}, id: 'g1' },
          { name: 'echo', args: { value: 'nope' }, id: 'e1' },
        ],
      }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [paint, echoTool],
      messages: [new HumanMessage('go')],
      shouldStopObservation: (text) => text.includes('image_generated'),
    });
    expect(
      actionSteps(result.steps).map((s) => (s.type === 'action' ? s.name : '')),
    ).toEqual(['generate_image']);
  });
});

describe('runToolCallingLoop safety', () => {
  function writeTool(name: string, impl?: () => Promise<string>) {
    const fn = jest.fn(impl ?? (async () => `${name}:done`));
    return {
      fn,
      tool: tool(fn, {
        name,
        description: `Mutating tool ${name}`,
        schema: z.object({}),
      }),
    };
  }

  it('runs only the first mutating call per model response and errors the rest', async () => {
    const first = writeTool('update_rule');
    const second = writeTool('remember');
    const model = fakeModel([
      new AIMessage({
        content: 'Two changes.',
        tool_calls: [
          { name: 'update_rule', args: {}, id: 'c1' },
          { name: 'remember', args: {}, id: 'c2' },
          { name: 'echo', args: { value: 'x' }, id: 'c3' },
        ],
      }),
      new AIMessage({ content: 'done' }),
    ]);

    const result = await runToolCallingLoop({
      model,
      tools: [first.tool, second.tool, echoTool],
      messages: [new HumanMessage('go')],
    });

    expect(first.fn).toHaveBeenCalledTimes(1);
    expect(second.fn).not.toHaveBeenCalled();
    const observations = result.steps.filter((s) => s.type === 'observation');
    expect(observations.map((o) => (o as { result: string }).result)).toEqual([
      'update_rule:done',
      ONE_MUTATION_PER_TURN_ERROR,
      'echo:x',
    ]);
    expect(JSON.parse(ONE_MUTATION_PER_TURN_ERROR)).toMatchObject({
      ok: false,
      code: 'one_mutation_per_turn',
    });
  });

  it('blocks a second mutating call in a later model response of the same turn', async () => {
    const write = writeTool('update_rule');
    const model = fakeModel([
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'update_rule', args: {}, id: 'c1' }],
      }),
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'update_rule', args: {}, id: 'c2' }],
      }),
      new AIMessage({ content: 'done' }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [write.tool],
      messages: [new HumanMessage('go')],
    });
    expect(write.fn).toHaveBeenCalledTimes(1);
    const observations = result.steps.filter((s) => s.type === 'observation');
    expect(observations.map((o) => (o as { result: string }).result)).toEqual([
      'update_rule:done',
      ONE_MUTATION_PER_TURN_ERROR,
    ]);
    expect(result.finalMessage.content).toBe('done');
  });

  it('blocks apply_default_workflow then generate_workflow across iterations (I-02)', async () => {
    const apply = writeTool('apply_default_workflow');
    const generate = writeTool('generate_workflow');
    const model = fakeModel([
      new AIMessage({
        content: 'Thought: Create the workflow.',
        tool_calls: [{ name: 'apply_default_workflow', args: {}, id: 'a1' }],
      }),
      new AIMessage({
        content: 'Thought: Now generate.',
        tool_calls: [{ name: 'generate_workflow', args: {}, id: 'g1' }],
      }),
      new AIMessage({ content: 'Thought: Report.\n\nYour workflow is ready.' }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [apply.tool, generate.tool],
      messages: [new HumanMessage('make the post')],
    });
    expect(apply.fn).toHaveBeenCalledTimes(1);
    expect(generate.fn).not.toHaveBeenCalled();
    expect(result.finalMessage.content).toBe('Your workflow is ready.');
  });

  it('does not invoke a tool blocked by guardToolCall and returns the guard observation', async () => {
    const approve = writeTool('approve_content');
    const model = fakeModel([
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'approve_content', args: {}, id: 'c1' }],
      }),
      new AIMessage({ content: 'need confirmation' }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [approve.tool],
      messages: [new HumanMessage('go')],
      guardToolCall: (name) => (name === 'approve_content' ? 'blocked' : null),
    });
    expect(approve.fn).not.toHaveBeenCalled();
    expect(result.steps).toContainEqual({
      type: 'observation',
      name: 'approve_content',
      toolCallId: 'c1',
      result: 'blocked',
    });
    const toolMessage = result.messages.find(
      (m) => m instanceof ToolMessage,
    ) as ToolMessage;
    expect(toolMessage.content).toBe('blocked');
  });

  it('passes the steps recorded so far this turn to guardToolCall', async () => {
    const rerun = writeTool('rerun_content_node');
    const save = writeTool('save_content');
    const model = fakeModel([
      new AIMessage({ content: '', tool_calls: [{ name: 'rerun_content_node', args: {}, id: 'r1' }] }),
      new AIMessage({ content: '', tool_calls: [{ name: 'save_content', args: {}, id: 's1' }] }),
      new AIMessage({ content: 'Making a new version.' }),
    ]);
    const seen: string[][] = [];
    await runToolCallingLoop({
      model,
      tools: [rerun.tool, save.tool],
      messages: [new HumanMessage('shorter please')],
      mutationLimit: 4,
      guardToolCall: (name, _args, turnSteps) => {
        seen.push(turnSteps.map((s) => `${s.type}:${'name' in s ? s.name : ''}`));
        return name === 'save_content' && turnSteps.some((s) => s.type === 'observation' && s.name === 'rerun_content_node')
          ? 'blocked'
          : null;
      },
    });
    expect(rerun.fn).toHaveBeenCalledTimes(1);
    expect(save.fn).not.toHaveBeenCalled();
    expect(seen[1]).toEqual(
      expect.arrayContaining(['observation:rerun_content_node', 'action:save_content']),
    );
  });

  it('turns a thrown tool error into an observation and keeps looping', async () => {
    const broken = writeTool('get_rule', async () => {
      throw new Error('db down');
    });
    const model = fakeModel([
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'get_rule', args: {}, id: 'c1' }],
      }),
      new AIMessage({ content: 'sorry, could not load it' }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [broken.tool],
      messages: [new HumanMessage('go')],
    });
    expect(result.finalMessage.content).toBe('sorry, could not load it');
    const observation = result.steps.find((s) => s.type === 'observation') as {
      result: string;
    };
    expect(JSON.parse(observation.result)).toEqual({
      ok: false,
      code: 'tool_failed',
      message: 'db down',
      next: expect.stringContaining('do not claim it worked'),
    });
  });

  it('maps thrown Nest HTTP exceptions with fromHttpException', async () => {
    const broken = writeTool('get_rule', async () => {
      throw new NotFoundException('Rule missing');
    });
    const model = fakeModel([
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'get_rule', args: {}, id: 'c1' }],
      }),
      new AIMessage({ content: 'done' }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [broken.tool],
      messages: [new HumanMessage('go')],
    });
    const observation = result.steps.find((s) => s.type === 'observation') as {
      result: string;
    };
    expect(JSON.parse(observation.result)).toMatchObject({
      code: 'not_found',
      message: 'Rule missing',
    });
  });

  it('reports summed usage and the last call input tokens separately', async () => {
    const model = fakeModel([
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'echo', args: { value: 'a' }, id: 'c1' }],
        usage_metadata: {
          input_tokens: 100,
          output_tokens: 10,
          total_tokens: 110,
        },
      }),
      new AIMessage({
        content: 'done',
        usage_metadata: {
          input_tokens: 150,
          output_tokens: 20,
          total_tokens: 170,
        },
      }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('go')],
    });
    expect(result.usage).toEqual({ inputTokens: 250, outputTokens: 30 });
    expect(result.lastInputTokens).toBe(150);
  });
});

describe('runToolCallingLoop final replies', () => {
  function scripted(responses: AIMessage[]) {
    const seen: BaseMessage[][] = [];
    let call = 0;
    const model = {
      bindTools: () => ({
        invoke: async (messages: BaseMessage[]) => {
          seen.push(messages);
          const response = responses[Math.min(call, responses.length - 1)];
          call += 1;
          return response;
        },
      }),
    } as unknown as BaseChatModel;
    return { model, seen, calls: () => call };
  }

  const startTool = tool(
    async () =>
      JSON.stringify({ ok: true, action: 'pipeline_started', pipelineId: 'p1' }),
    { name: 'start_generation', description: 'start', schema: z.object({}) },
  );

  it('re-prompts once when the reply is only a Thought line, then uses the real answer', async () => {
    const { model, seen } = scripted([
      new AIMessage({ content: 'Thought: I need to start the pipeline.' }),
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'start_generation', args: {}, id: 's1' }],
      }),
      new AIMessage({ content: 'I started your Thai post. Watch the pipeline card.' }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [startTool],
      messages: [new HumanMessage('make a Thai post')],
    });
    expect(
      actionSteps(result.steps).map((s) => (s.type === 'action' ? s.name : '')),
    ).toEqual(['start_generation']);
    expect(result.finalMessage.content).toBe(
      'I started your Thai post. Watch the pipeline card.',
    );
    expect(
      seen[1].some((m) => m instanceof HumanMessage && m.content === THOUGHT_ONLY_NUDGE),
    ).toBe(true);
  });

  it('never returns the raw Thought prefix when the model keeps replying Thought-only', async () => {
    const { model } = scripted([
      new AIMessage({ content: 'Thought: Still thinking about it.' }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('hi')],
    });
    expect(String(result.finalMessage.content)).not.toMatch(/^thought:/i);
    expect(result.finalMessage.content).toBe('Still thinking about it.');
  });

  it('asks the model for a result-based reply after a stop observation', async () => {
    const { model, seen } = scripted([
      new AIMessage({
        content: "Thought: I'll start the generation now.",
        tool_calls: [{ name: 'start_generation', args: {}, id: 's1' }],
      }),
      new AIMessage({ content: 'I started the generation. It takes about a minute.' }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [startTool],
      messages: [new HumanMessage('go')],
    });
    expect(result.finalMessage.content).toBe(
      'I started the generation. It takes about a minute.',
    );
    const last = seen[seen.length - 1];
    expect(last[last.length - 1]).toBeInstanceOf(HumanMessage);
    expect(last[last.length - 1].content).toBe(FINAL_REPLY_INSTRUCTION);
  });

  it('answers ask_user turns with the question, not the pre-tool plan', async () => {
    const { model } = scripted([
      new AIMessage({
        content: "Thought: I need confirmation, so I'll ask for a simple yes/no.",
        tool_calls: [
          {
            name: 'ask_user',
            args: { type: 'yes_no', question: 'Approve this draft?' },
            id: 'a1',
          },
        ],
      }),
    ]);
    const result = await runToolCallingLoop({
      model,
      tools: [createAskUserTool()],
      messages: [new HumanMessage('approve it')],
    });
    expect(result.finalMessage.content).toBe('Approve this draft?');
  });

  it('summarizes with one more call when the iteration cap is hit', async () => {
    let call = 0;
    const model = {
      bindTools: () => ({
        invoke: async () => {
          call += 1;
          return call <= 2
            ? new AIMessage({
                content: '',
                tool_calls: [{ name: 'echo', args: { value: 'x' }, id: `e${call}` }],
              })
            : new AIMessage({ content: 'I checked twice; here is what I found.' });
        },
      }),
    } as unknown as BaseChatModel;
    const result = await runToolCallingLoop({
      model,
      tools: [echoTool],
      messages: [new HumanMessage('go')],
      maxIterations: 2,
    });
    expect(result.finalMessage.content).toBe('I checked twice; here is what I found.');
  });
});
