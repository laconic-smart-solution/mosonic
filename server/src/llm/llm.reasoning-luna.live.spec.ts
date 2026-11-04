import { resolve } from 'path';
import { config as loadEnv } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { tool } from '@langchain/core/tools';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { LlmService } from './llm.service';

loadEnv({ path: resolve(__dirname, '../../.env'), quiet: true });

const live = Boolean(process.env.OPENAI_API_KEY?.startsWith('sk-'));

/**
 * Hits OpenAI with gpt-6-luna + bindTools. Skipped when no API key is loaded.
 * Run: yarn test src/llm/llm.reasoning-luna.live.spec.ts
 */
(live ? describe : describe.skip)('gpt-6-luna bindTools (live)', () => {
  jest.setTimeout(60_000);

  it('calls a bound tool via the Responses API', async () => {
    const config = {
      get: (key: string) => process.env[key],
    } as unknown as ConfigService;
    const llm = new LlmService(config);
    expect(llm.getReasoningModelId()).toBe('gpt-6-luna');

    const add = tool(
      async ({ a, b }: { a: number; b: number }) => JSON.stringify({ sum: a + b }),
      {
        name: 'add',
        description: 'Add two numbers.',
        schema: z.object({ a: z.number(), b: z.number() }),
      },
    );

    const model = llm.getReasoningChatModel().bindTools([add]);
    const res = await model.invoke([
      new HumanMessage('Use the add tool to compute 2 plus 3. Do not guess.'),
    ]);
    const calls = res.tool_calls ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]?.name).toBe('add');
  });
});
