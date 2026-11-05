import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { WorkflowNodeConfig } from '../schemas/workflow-node.schema';
import type {
  NodeExecutionInput,
  NodeExecutionResult,
} from '../types/node-execution.types';

/**
 * Subtitle node: pure local transform from transcription text into SRT / WebVTT.
 * No AI / Whisper / LLM calls - timing is spread evenly over the known (or
 * estimated) audio duration, weighted by word count per cue.
 */

export type SubtitleFormat = 'srt' | 'vtt';

export const SUBTITLE_DEFAULT_MAX_CHARS_PER_LINE = 42;
/** Average speaking rate used when the source duration is unknown. */
export const SUBTITLE_WORDS_PER_SECOND = 2.5;
const MAX_LINES_PER_CUE = 2;
const MIN_CUE_SECONDS = 1;

export type SubtitleCue = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
};

export type SubtitleBuildOptions = {
  maxCharsPerLine?: number;
  audioDurationSeconds?: number;
};

function clampMaxChars(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0;
  if (n < 10) return SUBTITLE_DEFAULT_MAX_CHARS_PER_LINE;
  return Math.min(n, 120);
}

function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  // Scripts without spaces (Thai, CJK): approximate words by characters / 4.
  if (words.length <= 1 && text.trim().length > 12) {
    return Math.max(1, Math.round(text.trim().length / 4));
  }
  return Math.max(1, words.length);
}

/** Split text into sentences on . ! ? (and CJK full stops) and blank lines. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n|(?<=[.!?\u3002\uff01\uff1f])\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Greedy word wrap; words longer than maxChars are hard-split. */
export function wrapLines(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const rawWord of text.split(/\s+/).filter(Boolean)) {
    let word = rawWord;
    while (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!word) continue;
    if (!current) current = word;
    else if (current.length + 1 + word.length <= maxChars) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function estimateDurationSeconds(text: string): number {
  return Math.max(MIN_CUE_SECONDS, Math.ceil(countWords(text) / SUBTITLE_WORDS_PER_SECOND));
}

export function buildSubtitleCues(
  text: string,
  opts: SubtitleBuildOptions = {},
): SubtitleCue[] {
  const maxChars = clampMaxChars(opts.maxCharsPerLine);
  const blocks: string[] = [];
  for (const sentence of splitSentences(text)) {
    const lines = wrapLines(sentence, maxChars);
    for (let i = 0; i < lines.length; i += MAX_LINES_PER_CUE) {
      blocks.push(lines.slice(i, i + MAX_LINES_PER_CUE).join('\n'));
    }
  }
  if (!blocks.length) return [];

  const total =
    typeof opts.audioDurationSeconds === 'number' &&
    Number.isFinite(opts.audioDurationSeconds) &&
    opts.audioDurationSeconds > 0
      ? opts.audioDurationSeconds
      : estimateDurationSeconds(text);
  const weights = blocks.map((b) => countWords(b));
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const cues: SubtitleCue[] = [];
  let cursor = 0;
  blocks.forEach((block, i) => {
    const isLast = i === blocks.length - 1;
    const span = (total * weights[i]) / weightSum;
    const end = isLast ? total : Math.round((cursor + span) * 1000) / 1000;
    cues.push({ index: i + 1, startSeconds: cursor, endSeconds: end, text: block });
    cursor = end;
  });
  return cues;
}

export function formatSubtitleTimestamp(
  seconds: number,
  format: SubtitleFormat,
): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const sep = format === 'srt' ? ',' : '.';
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms, 3)}`;
}

function renderCues(cues: SubtitleCue[], format: SubtitleFormat): string {
  return cues
    .map(
      (c) =>
        `${c.index}\n${formatSubtitleTimestamp(c.startSeconds, format)} --> ${formatSubtitleTimestamp(c.endSeconds, format)}\n${c.text}`,
    )
    .join('\n\n');
}

export function buildSrt(text: string, opts: SubtitleBuildOptions = {}): string {
  const cues = buildSubtitleCues(text, opts);
  return cues.length ? `${renderCues(cues, 'srt')}\n` : '';
}

export function buildVtt(text: string, opts: SubtitleBuildOptions = {}): string {
  const cues = buildSubtitleCues(text, opts);
  return cues.length ? `WEBVTT\n\n${renderCues(cues, 'vtt')}\n` : 'WEBVTT\n';
}

export function normalizeSubtitleFormat(raw: unknown): SubtitleFormat {
  return raw === 'vtt' ? 'vtt' : 'srt';
}

/** Source text: explicit config.sourceText wins, else upstream transcription. */
export function resolveSubtitleSourceText(
  config: WorkflowNodeConfig | undefined,
  previousOutputs: NodeExecutionInput['previousOutputs'],
): string {
  const fromConfig =
    typeof config?.sourceText === 'string' ? config.sourceText.trim() : '';
  if (fromConfig) return fromConfig;
  return previousOutputs?.transcription?.trim() ?? '';
}

@Injectable()
export class SubtitleService {
  execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    const config = input.config ?? {};
    const source = resolveSubtitleSourceText(config, input.previousOutputs);
    if (!source) {
      return Promise.reject(
        new UnprocessableEntityException(
          'Subtitle requires upstream transcription text (add a Transcription step before Subtitle) or config.sourceText',
        ),
      );
    }
    const format = normalizeSubtitleFormat(config.format);
    const audioDurationSeconds =
      typeof config.audioDurationSeconds === 'number' &&
      config.audioDurationSeconds > 0
        ? config.audioDurationSeconds
        : undefined;
    const opts = { maxCharsPerLine: config.maxCharsPerLine, audioDurationSeconds };
    const subtitle = format === 'vtt' ? buildVtt(source, opts) : buildSrt(source, opts);
    return Promise.resolve({
      output: subtitle,
      subtitle,
      subtitleFormat: format,
      ...(audioDurationSeconds ? { audioDurationSeconds } : {}),
    });
  }
}
