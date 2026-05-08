import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessageLike } from '@langchain/core/messages';
import { LlmService } from '../llm/llm.service';
import { extractPdfText } from './pdf-text';
import type {
  PreprocessedChunk,
  PreprocessedPayload,
} from './preprocessed.types';
import { normalizeWhitespace } from './text-utils';

const SUMMARY_SYSTEM = [
  'You summarize marketing and brand inputs for downstream structured extraction.',
  'Summarize all brand strategy, tone, audience, goals, and marketing information from the content.',
  'Output plain prose only — no JSON, no markdown fences, no bullet lists unless essential.',
].join(' ');

function messageContentToString(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object' && 'text' in c) {
          return String((c as { text?: string }).text ?? '');
        }
        return '';
      })
      .join('\n')
      .trim();
  }
  return typeof content === 'object' && content !== null
    ? ''
    : String(content).trim();
}

@Injectable()
export class ContentReaderService {
  private readonly logger = new Logger(ContentReaderService.name);

  constructor(private readonly llm: LlmService) {}

  async summarize(payload: PreprocessedPayload): Promise<string> {
    try {
      return await this.invokeSummarize(payload);
    } catch (firstError) {
      const repaired = await this.pdfChunksToTextFallback(payload);
      if (!repaired) throw firstError;
      this.logger.warn(
        `Content reader retry after PDF fallback: ${(firstError as Error).message}`,
      );
      return await this.invokeSummarize(repaired);
    }
  }

  /** Convert PDF base64 chunks to extracted text when multimodal PDF fails. */
  private async pdfChunksToTextFallback(
    payload: PreprocessedPayload,
  ): Promise<PreprocessedPayload | null> {
    let changed = false;
    const chunks: PreprocessedChunk[] = [];
    for (const ch of payload.chunks) {
      if (ch.kind === 'base64' && ch.mime === 'application/pdf') {
        changed = true;
        const buf = Buffer.from(ch.base64, 'base64');
        const text = normalizeWhitespace(await extractPdfText(buf));
        chunks.push({ kind: 'text', label: ch.label, text });
      } else {
        chunks.push(ch);
      }
    }
    if (!changed) return null;
    return { userText: payload.userText, chunks };
  }

  private async invokeSummarize(payload: PreprocessedPayload): Promise<string> {
    const model = this.llm.getChatModelForPlainText();
    const system = new SystemMessage(SUMMARY_SYSTEM);

    const hasBinary = payload.chunks.some((c) => c.kind === 'base64');
    if (hasBinary) {
      this.llm.assertProviderCapability(undefined, 'vision_describe');
    }

    if (!hasBinary) {
      const pieces: string[] = [];
      const ut = payload.userText.trim();
      if (ut) pieces.push(`User prompt:\n${ut}`);
      for (const ch of payload.chunks) {
        if (ch.kind === 'text' && ch.text.trim()) {
          pieces.push(`--- ${ch.label} ---\n${ch.text}`);
        }
      }
      const body = pieces.join('\n\n').trim();
      if (!body) return '';
      const res = await model.invoke([
        system,
        new HumanMessage(body),
      ] as BaseMessageLike[]);
      return messageContentToString(res.content);
    }

    const content: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [];

    const ut = payload.userText.trim();
    if (ut) {
      content.push({ type: 'text', text: `User prompt:\n${ut}` });
    }

    for (const ch of payload.chunks) {
      if (ch.kind === 'text') {
        if (ch.text.trim()) {
          content.push({
            type: 'text',
            text: `\n--- ${ch.label} ---\n${ch.text}`,
          });
        }
        continue;
      }
      content.push({
        type: 'text',
        text: `\n[${ch.label} — ${ch.mime}]\n`,
      });
      const dataUrl = `data:${ch.mime};base64,${ch.base64}`;
      content.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    }

    const res = await model.invoke([
      system,
      new HumanMessage({ content }),
    ] as BaseMessageLike[]);
    return messageContentToString(res.content);
  }
}
