import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../llm/llm.service';
import {
  calcWordBudget,
  countWords,
  needsRewrite,
  PRESENTER_WORDS_PER_SECOND,
  simpleTrim,
} from './presenter-script.util';

export type ScriptFitMethod = 'unchanged' | 'rewritten' | 'trimmed';

export type ScriptFitResult = {
  script: string;
  wordCount: number;
  method: ScriptFitMethod;
};

function messageContentToString(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (
          typeof part === 'object' &&
          part !== null &&
          'text' in part &&
          typeof (part as { text: unknown }).text === 'string'
        ) {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

@Injectable()
export class ScriptDurationService {
  private readonly logger = new Logger(ScriptDurationService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Returns a script that fits the target duration.
   * Uses GPT rewrite when over threshold; falls back to simple trim on failure.
   */
  async fitScriptToDuration(
    rawScript: string,
    durationSeconds: number,
  ): Promise<ScriptFitResult> {
    const budget = calcWordBudget(durationSeconds);
    const wordCount = countWords(rawScript);

    this.logger.log(
      `[ScriptDuration] raw=${wordCount}w budget=${budget}w duration=${durationSeconds}s`,
    );

    if (!needsRewrite(rawScript, durationSeconds)) {
      this.logger.log('[ScriptDuration] script fits — no rewrite needed');
      const trimmed = rawScript.trim();
      return {
        script: trimmed,
        wordCount: countWords(trimmed),
        method: 'unchanged',
      };
    }

    this.logger.log(
      `[ScriptDuration] script too long (${wordCount}w > ${budget}w) — rewriting`,
    );

    try {
      const rewritten = await this.rewriteWithGpt(
        rawScript,
        durationSeconds,
        budget,
      );
      const rewrittenWords = countWords(rewritten);
      this.logger.log(`[ScriptDuration] rewritten to ${rewrittenWords}w`);
      return {
        script: rewritten,
        wordCount: rewrittenWords,
        method: 'rewritten',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[ScriptDuration] GPT rewrite failed: ${message} — using simple trim`,
      );
      const trimmed = simpleTrim(rawScript, durationSeconds);
      return {
        script: trimmed,
        wordCount: countWords(trimmed),
        method: 'trimmed',
      };
    }
  }

  private rewriteModel(): string {
    return (
      this.config.get<string>('SCRIPT_REWRITE_OPENAI_MODEL')?.trim() ||
      'gpt-4o-mini'
    );
  }

  private async rewriteWithGpt(
    originalScript: string,
    durationSeconds: number,
    wordBudget: number,
  ): Promise<string> {
    const prompt = [
      `You are a video script writer. Rewrite the script below to fit a ${durationSeconds}-second video.`,
      '',
      'REQUIREMENTS:',
      `  - Target length: ~${wordBudget} words (at ${PRESENTER_WORDS_PER_SECOND} words/second)`,
      `  - Maximum: ${wordBudget} words — do NOT exceed this`,
      '  - Keep the core message and key information',
      '  - Maintain the same tone and language as the original',
      '  - Must end with a natural, complete sentence (no cut-offs)',
      '  - End with a clear call to action if the original had one',
      '  - Output ONLY the rewritten script — no titles, no explanations',
      '',
      '=== ORIGINAL SCRIPT ===',
      originalScript.trim(),
    ].join('\n');

    const model = this.llm.getChatModelForPlainText({
      model: this.rewriteModel(),
      temperature: 0.4,
    });

    const result = await model.invoke([
      new SystemMessage(
        'You are a professional video script writer. Output only the rewritten script text, nothing else.',
      ),
      new HumanMessage(prompt),
    ]);

    const text = messageContentToString(result.content).trim();
    if (!text) {
      throw new Error('GPT returned empty script');
    }

    const words = countWords(text);
    if (words > wordBudget * 1.1) {
      this.logger.warn(
        `[ScriptDuration] GPT returned ${words}w (over budget ${wordBudget}w) — hard trimming`,
      );
      return simpleTrim(text, durationSeconds);
    }

    return text;
  }
}
