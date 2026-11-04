import { AIMessage } from '@langchain/core/messages';
import type { ToolCallingLoopResult } from '../tools/tool-calling-loop';

type Lang = 'en' | 'th' | 'zh' | 'my';

const GREETING = /^\s*(h+i+|hello+|hel+o+|hey+|hiya|yo|sup|good (morning|afternoon|evening)|\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35(\u0e04\u0e23\u0e31\u0e1a|\u0e04\u0e48\u0e30|\u0e04\u0e30|\u0e08\u0e49\u0e32)?|\u0e2b\u0e27\u0e31\u0e14\u0e14\u0e35|\u4f60\u597d|\u60a8\u597d|\u55e8|\u54c8\u55bd|\u1019\u1004\u103a\u1039\u1002\u101c\u102c\u1015\u102b)(\s+(there|all|team))?[\s!.~,?\uff01\uff1f\u3002]*$/i;

/** True for a message that is only a greeting (no brand info, no task). */
export function isBareGreeting(text: string): boolean {
  return GREETING.test(text.trim());
}

function langOf(text: string): Lang {
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  if (/[\u1000-\u109F]/.test(text)) return 'my';
  return 'en';
}

const COPY: Record<Lang, { question: string; labels: [string, string, string, string] }> = {
  en: { question: 'Hi! I can set up your brand, then plan and make posts for your channels. Where would you like to start?', labels: ['Set up my brand', 'Make a post', 'Paste my website', 'Just exploring'] },
  th: { question: '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e04\u0e48\u0e30! \u0e09\u0e31\u0e19\u0e0a\u0e48\u0e27\u0e22\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e41\u0e1a\u0e23\u0e19\u0e14\u0e4c\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13 \u0e41\u0e25\u0e49\u0e27\u0e27\u0e32\u0e07\u0e41\u0e1c\u0e19\u0e41\u0e25\u0e30\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e42\u0e1e\u0e2a\u0e15\u0e4c\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e0a\u0e48\u0e2d\u0e07\u0e17\u0e32\u0e07\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e44\u0e14\u0e49 \u0e2d\u0e22\u0e32\u0e01\u0e40\u0e23\u0e34\u0e48\u0e21\u0e08\u0e32\u0e01\u0e15\u0e23\u0e07\u0e44\u0e2b\u0e19\u0e14\u0e35\u0e04\u0e30?', labels: ['\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e41\u0e1a\u0e23\u0e19\u0e14\u0e4c\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19', '\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e42\u0e1e\u0e2a\u0e15\u0e4c', '\u0e27\u0e32\u0e07\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e40\u0e27\u0e47\u0e1a\u0e44\u0e0b\u0e15\u0e4c', '\u0e41\u0e04\u0e48\u0e14\u0e39\u0e01\u0e48\u0e2d\u0e19'] },
  zh: { question: '\u4f60\u597d\uff01\u6211\u53ef\u4ee5\u5e2e\u4f60\u8bbe\u7f6e\u54c1\u724c\uff0c\u7136\u540e\u4e3a\u4f60\u7684\u6e20\u9053\u7b56\u5212\u548c\u5236\u4f5c\u5e16\u5b50\u3002\u4f60\u60f3\u4ece\u54ea\u91cc\u5f00\u59cb\uff1f', labels: ['\u8bbe\u7f6e\u6211\u7684\u54c1\u724c', '\u5236\u4f5c\u5e16\u5b50', '\u7c98\u8d34\u6211\u7684\u7f51\u7ad9', '\u968f\u4fbf\u770b\u770b'] },
  my: { question: '\u1019\u1004\u103a\u1039\u1002\u101c\u102c\u1015\u102b! \u101e\u1004\u1037\u103a\u1018\u101b\u1014\u103a\u1038\u1000\u102d\u102f \u1005\u102e\u1005\u1009\u103a\u1015\u1031\u1038\u1015\u103c\u102e\u1038 \u101e\u1004\u1037\u103a\u1001\u103b\u1014\u103a\u1014\u101a\u103a\u1019\u103b\u102c\u1038\u1021\u1010\u103d\u1000\u103a \u1015\u102d\u102f\u1037\u1005\u103a\u1019\u103b\u102c\u1038 \u1016\u1014\u103a\u1010\u102e\u1038\u1015\u1031\u1038\u1014\u102d\u102f\u1004\u103a\u1015\u102b\u1010\u101a\u103a\u104b \u1018\u101a\u103a\u1000\u1014\u1031 \u1005\u101c\u102d\u102f\u1015\u102b\u101e\u101c\u1032?', labels: ['\u1018\u101b\u1014\u103a\u1038 \u1005\u102e\u1005\u1009\u103a\u1019\u101a\u103a', '\u1015\u102d\u102f\u1037\u1005\u103a \u101c\u102f\u1015\u103a\u1019\u101a\u103a', '\u101d\u1000\u103a\u1018\u103a\u1006\u102d\u102f\u1000\u103a \u1011\u100a\u1037\u103a\u1019\u101a\u103a', '\u1000\u103c\u100a\u1037\u103a\u101b\u102f\u1036\u1015\u1032'] },
};
const IDS = ['setup_brand', 'make_post', 'paste_website', 'exploring'] as const;

/** Fixed welcome for a bare first greeting with no brand: real ask_user chips, no model call. */
export function buildGreetingResult(text: string): ToolCallingLoopResult {
  const copy = COPY[langOf(text)];
  const args = { type: 'single', question: copy.question, options: IDS.map((id, i) => ({ id, label: copy.labels[i] })) };
  const toolCallId = 'greeting-' + Date.now();
  const finalMessage = new AIMessage(copy.question);
  return {
    finalMessage,
    messages: [finalMessage],
    steps: [
      { type: 'action', name: 'ask_user', args, toolCallId },
      { type: 'observation', name: 'ask_user', toolCallId, result: JSON.stringify({ action: 'ask_user', ...args }) },
    ],
    usage: { inputTokens: 0, outputTokens: 0 },
    lastInputTokens: 0,
  };
}

const CHIP_JSON = /\s*\{\s*"(type|action|question|options)"\s*:[\s\S]*?"options"\s*:\s*\[[\s\S]*$/;

/** Never show raw ask_user JSON in reply text; keep the prose before it. */
export function stripChipJson(text: string): string {
  if (!CHIP_JSON.test(text)) return text;
  const prose = text.replace(CHIP_JSON, '').trim();
  if (prose) return prose;
  const q = /"question"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  return q ? q[1] : '';
}

const TURN_TALK = /[^.!?\n]*\b(send (me )?(one|another) more message|(in|on) (the|your) (next|same) (turn|message)|next turn|same turn|one change per (message|turn)|only one change)\b[^.!?\n]*[.!?]?/gi;

/** Final reply guard: no chip JSON, no talk about turn or message limits. */
export function sanitizeReply(text: string, opts: { noWorkflow?: boolean } = {}): string {
  let out = stripChipJson(text);
  // No workflow yet: never ask about updating one (a channel change just confirms the brand).
  if (opts.noWorkflow) out = out.replace(/[^.!?\n]*\bworkflow\b[^.!?\n]*\?/gi, '').replace(/[ \t]{2,}/g, ' ').trim() || out;
  if (new RegExp(TURN_TALK.source, 'i').test(out)) {
    out = out.replace(TURN_TALK, '').replace(/[ \t]{2,}/g, ' ').trim();
    if (!out) out = 'Want me to continue with the next step?';
  }
  return out;
}
