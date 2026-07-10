import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../llm/llm.service';
import {
  calcWordBudget,
  countWords,
  needsExpand,
  needsRewrite,
  resolveHeygenWordsPerSecond,
  sanitizeSpokenScript,
  simpleTrim,
} from './presenter-script.util';

export type ScriptFitMethod =
  | 'unchanged'
  | 'rewritten'
  | 'trimmed'
  | 'expanded';

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

  private heygenWps(): number {
    return resolveHeygenWordsPerSecond(
      this.config.get<string>('HEYGEN_WORDS_PER_SECOND'),
    );
  }

  /**
   * Returns a script that fits the target duration.
   * Uses GPT rewrite when over threshold, expand when under, trim on failure.
   */
  async fitScriptToDuration(
    rawScript: string,
    durationSeconds: number,
  ): Promise<ScriptFitResult> {
    const wps = this.heygenWps();
    const budget = calcWordBudget(durationSeconds, wps);
    const sanitized = sanitizeSpokenScript(rawScript.trim());
    const wordCount = countWords(sanitized);

    this.logger.log(
      `[ScriptDuration] raw=${wordCount}w budget=${budget}w duration=${durationSeconds}s wps=${wps}`,
    );

    if (needsRewrite(sanitized, durationSeconds, wps)) {
      return this.rewriteToFit(sanitized, durationSeconds, budget, wps);
    }

    if (needsExpand(sanitized, durationSeconds, wps)) {
      return this.expandToFit(sanitized, durationSeconds, budget, wps);
    }

    this.logger.log('[ScriptDuration] script fits — no rewrite needed');
    return {
      script: sanitized,
      wordCount,
      method: 'unchanged',
    };
  }

  private async rewriteToFit(
    script: string,
    durationSeconds: number,
    budget: number,
    wps: number,
  ): Promise<ScriptFitResult> {
    const wordCount = countWords(script);
    this.logger.log(
      `[ScriptDuration] script too long (${wordCount}w > ${budget}w) — rewriting`,
    );

    try {
      const rewritten = await this.rewriteWithGpt(
        script,
        durationSeconds,
        budget,
        wps,
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
      const trimmed = sanitizeSpokenScript(
        simpleTrim(script, durationSeconds, wps),
      );
      return {
        script: trimmed,
        wordCount: countWords(trimmed),
        method: 'trimmed',
      };
    }
  }

  private async expandToFit(
    script: string,
    durationSeconds: number,
    budget: number,
    wps: number,
  ): Promise<ScriptFitResult> {
    const wordCount = countWords(script);
    this.logger.log(
      `[ScriptDuration] script too short (${wordCount}w < ${Math.floor(budget * 0.85)}w) — expanding`,
    );

    try {
      const expanded = await this.expandWithGpt(
        script,
        durationSeconds,
        budget,
        wps,
      );
      const expandedWords = countWords(expanded);
      this.logger.log(`[ScriptDuration] expanded to ${expandedWords}w`);
      return {
        script: expanded,
        wordCount: expandedWords,
        method: 'expanded',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[ScriptDuration] GPT expand failed: ${message} — keeping original script`,
      );
      return {
        script,
        wordCount,
        method: 'unchanged',
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
    wps: number,
  ): Promise<string> {
    const prompt = [
      `Rewrite the text below into a ${durationSeconds}-second presenter video script — one person speaking directly to the camera.`,
      '',
      'LENGTH:',
      `  - Target: ~${wordBudget} words (read aloud at ~${wps} words/second)`,
      `  - Hard maximum: ${wordBudget} words — do NOT exceed this`,
      '',
      'SPOKEN STYLE (critical):',
      '  - Write how a real person talks, not how a social post reads',
      '  - Use short sentences, contractions, and a natural conversational rhythm',
      '  - Sound warm and human — like explaining something to a friend, not reading marketing copy',
      '  - One continuous monologue; no lists, headings, labels, or stage directions',
      '',
      'CONVERT FROM SOCIAL / MARKETING COPY:',
      '  - Turn caption-style text into full spoken sentences',
      '  - Remove ALL hashtags, @mentions, URLs, and emoji',
      '  - Do not say "link in bio", "swipe up", or other platform-only phrases',
      '  - Keep the core message, key facts, and call-to-action intent',
      '',
      'OUTPUT:',
      '  - Plain spoken text only — no titles, quotes, markdown, or explanations',
      '  - Must end with a complete sentence (no cut-offs)',
      '  - If the original had a CTA, express it naturally in spoken words',
      '',
      '=== ORIGINAL TEXT ===',
      originalScript.trim(),
    ].join('\n');

    return this.invokeGptScript(prompt, durationSeconds, wordBudget, wps);
  }

  private async expandWithGpt(
    originalScript: string,
    durationSeconds: number,
    wordBudget: number,
    wps: number,
  ): Promise<string> {
    const prompt = [
      `Expand the text below into a ${durationSeconds}-second presenter video script — one person speaking directly to the camera.`,
      '',
      'LENGTH:',
      `  - Target: ~${wordBudget} words (read aloud at ~${wps} words/second)`,
      `  - Aim for ${Math.floor(wordBudget * 0.9)}–${wordBudget} words`,
      `  - Do NOT exceed ${wordBudget} words`,
      '',
      'SPOKEN STYLE (critical):',
      '  - Write how a real person talks, not how a social post reads',
      '  - Use short sentences, contractions, and a natural conversational rhythm',
      '  - Sound warm and human — like explaining something to a friend',
      '  - One continuous monologue; no lists, headings, labels, or stage directions',
      '',
      'EXPANSION RULES:',
      '  - Keep the same core message, facts, and call-to-action',
      '  - Add natural transitions, brief context, or a warmer intro/outro',
      '  - Do NOT invent unrelated claims or contact details',
      '  - Remove ALL hashtags, @mentions, URLs, and emoji',
      '',
      'OUTPUT:',
      '  - Plain spoken text only — no titles, quotes, markdown, or explanations',
      '  - Must end with a complete sentence',
      '',
      '=== ORIGINAL TEXT ===',
      originalScript.trim(),
    ].join('\n');

    return this.invokeGptScript(prompt, durationSeconds, wordBudget, wps);
  }

  private async invokeGptScript(
    prompt: string,
    durationSeconds: number,
    wordBudget: number,
    wps: number,
  ): Promise<string> {
    const model = this.llm.getChatModelForPlainText({
      model: this.rewriteModel(),
      temperature: 0.5,
    });

    const result = await model.invoke([
      new SystemMessage(
        'You convert social-media and marketing copy into natural spoken video scripts. ' +
          'Output only the words the presenter will say aloud — no hashtags, metadata, or commentary.',
      ),
      new HumanMessage(prompt),
    ]);

    const text = sanitizeSpokenScript(
      messageContentToString(result.content).trim(),
    );
    if (!text) {
      throw new Error('GPT returned empty script');
    }

    const words = countWords(text);
    if (words > wordBudget * 1.1) {
      this.logger.warn(
        `[ScriptDuration] GPT returned ${words}w (over budget ${wordBudget}w) — hard trimming`,
      );
      return simpleTrim(text, durationSeconds, wps);
    }

    return text;
  }
}
