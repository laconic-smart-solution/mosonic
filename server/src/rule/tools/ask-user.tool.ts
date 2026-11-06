import { blankBrandAskBlock } from '../chat/blank-brand.util';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { falseImpossibilityAskBlock } from '../chat/false-impossibility.util';

export const ASK_USER_TOOL_NAME = 'ask_user';

export function isAskUserObservation(result: string): boolean {
  try {
    const parsed: unknown = JSON.parse(result);
    return (
      !!parsed &&
      typeof parsed === 'object' &&
      (parsed as { action?: unknown }).action === 'ask_user'
    );
  } catch {
    return false;
  }
}

const OPTION_SCHEMA = z.object({
  id: z.string().describe('Stable id the next user message will echo (e.g. yes, instagram).'),
  label: z.string().describe('Button label shown to the user.'),
  inputType: z
    .enum(['url'])
    .optional()
    .describe(
      'Set to url when picking this option means the user must type something (e.g. "I have a website URL"): the button opens a URL field and their link is sent with the choice.',
    ),
});

const ASK_USER_SCHEMA = z.object({
  type: z
    .enum(['yes_no', 'single', 'multi'])
    .describe(
      'yes_no: two buttons. single: pick one option. multi: pick one or more, then confirm.',
    ),
  question: z.string().describe('The question to show above the buttons.'),
  options: z
    .array(OPTION_SCHEMA)
    .optional()
    .describe(
      'Required for single and multi (at least two). For yes_no, omit to use Yes/No.',
    ),
  plan: z
    .object({
      youAskedFor: z.union([z.string(), z.array(z.string())]),
      willChange: z.array(z.string()),
      notPossible: z.array(z.string()),
    })
    .optional()
    .describe('Plan confirm card: copy it from a capability_mismatch / capability_gap result. Shown as You asked for / I will change / Not possible lines.'),
});

export type AskUserObservation = {
  action: 'ask_user';
  type: 'yes_no' | 'single' | 'multi';
  question: string;
  options: { id: string; label: string; inputType?: 'url' }[];
  plan?: { youAskedFor: string | string[]; willChange: string[]; notPossible: string[] };
};

const URL_OPTION_PATTERN = /\b(url|website|web site|link)\b/i;

/** Options that mean "I'll give you my link" need a URL field even if the model forgot inputType. */
function resolveInputType(option: {
  id: string;
  label: string;
  inputType?: 'url';
}): 'url' | undefined {
  if (option.inputType) return option.inputType;
  return URL_OPTION_PATTERN.test(option.id) || URL_OPTION_PATTERN.test(option.label)
    ? 'url'
    : undefined;
}

const DEFAULT_YES_NO: AskUserObservation['options'] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];

/**
 * Pure UI-signal tool — pauses the ReAct loop so the human can pick.
 * The client renders buttons from the JSON observation; the click is the
 * next user chat message. No I/O.
 */
/** `blankBrand`: the bound brand is still empty - block post/intro/generate choices (intake first). */
export function createAskUserTool(opts: { blankBrand?: boolean } = {}) {
  return tool(
    async ({ type, question, options, plan }): Promise<string> => {
      const resolved =
        type === 'yes_no'
          ? options && options.length >= 2
            ? options
            : DEFAULT_YES_NO
          : options ?? [];

      if (type !== 'yes_no' && resolved.length < 2) {
        return 'ask_user needs at least two options for single/multi. Ask in plain text instead, or pass options.';
      }

      const blocked = falseImpossibilityAskBlock({
        question: question ?? '',
        options: resolved,
        plan: plan
          ? {
              willChange: plan.willChange ?? [],
              notPossible: plan.notPossible ?? [],
            }
          : null,
      });
      if (blocked) return blocked;
      if (opts.blankBrand) {
        const blankBlock = blankBrandAskBlock({ question: question ?? '', options: resolved });
        if (blankBlock) return blankBlock;
      }

      const payload: AskUserObservation = {
        action: 'ask_user',
        type,
        question: question.trim(),
        options: resolved.map((o) => {
          const inputType = resolveInputType(o);
          return {
            id: o.id.trim(),
            label: o.label.trim(),
            ...(inputType ? { inputType } : {}),
          };
        }),
        ...(plan
          ? {
              plan: {
                youAskedFor: Array.isArray(plan.youAskedFor)
                  ? plan.youAskedFor.map((x) => x.trim()).filter(Boolean)
                  : plan.youAskedFor.trim(),
                willChange: plan.willChange.filter((x) => x.trim()),
                notPossible: plan.notPossible.filter((x) => x.trim()),
              },
            }
          : {}),
      };
      return JSON.stringify(payload);
    },
    {
      name: ASK_USER_TOOL_NAME,
      description:
        'Ask the user to decide with on-screen buttons (yes/no, one option, or several). Call this instead of a yes/no question in plain text when the next step is a real choice (create profile, which platforms, publish). Do not call any other tool in the same turn - wait for their next message. Content ideas or topic angles go here as options (up to 4, recommended first) with a one-line question, never as a numbered list in the reply; a bare yes/sure afterwards means the first idea. Set inputType "url" on an option that needs a typed website link. If your reply text already asks the question, keep this question to a few words.',
      schema: ASK_USER_SCHEMA,
    },
  );
}
