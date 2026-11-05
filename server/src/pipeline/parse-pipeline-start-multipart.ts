import { BadRequestException } from '@nestjs/common';
import type { Express } from 'express';
import {
  mergeUrlSources,
  tryNormalizeHttpUrl,
} from '../preprocessing/url-safety';
import type { UploadedFileLike } from '../preprocessing/preprocessed.types';

export type ParsedPipelineStartAttachments = {
  contentPrompt: string;
  files: UploadedFileLike[];
  urls: string[];
};

function parseUrlsField(urlsRaw: unknown): string[] {
  if (urlsRaw === undefined || urlsRaw === null || urlsRaw === '') {
    return [];
  }
  if (typeof urlsRaw !== 'string') {
    throw new BadRequestException('Field urls must be a JSON array string');
  }
  try {
    const parsed = JSON.parse(urlsRaw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('urls must be a JSON array');
    }
    const out: string[] = [];
    for (const u of parsed) {
      if (typeof u !== 'string' || !u.trim()) continue;
      const normalized = tryNormalizeHttpUrl(u);
      if (normalized) out.push(normalized);
    }
    return out;
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('urls must be valid JSON');
  }
}

/**
 * Multipart fields for POST /pipeline/start:
 * contentPrompt, files (repeatable), urls (JSON array string),
 * plus optional JSON fields mirrored from StartPipelineDto.
 */
export function parsePipelineStartMultipart(
  files: Express.Multer.File[] | undefined,
  contentPromptRaw: unknown,
  urlsRaw: unknown,
): ParsedPipelineStartAttachments {
  const contentPrompt =
    typeof contentPromptRaw === 'string' ? contentPromptRaw.trim() : '';
  const fileList = files ?? [];
  const urlList = mergeUrlSources(contentPrompt, parseUrlsField(urlsRaw));

  if (!contentPrompt && fileList.length === 0 && urlList.length === 0) {
    throw new BadRequestException(
      'Provide contentPrompt, at least one file, or urls',
    );
  }

  return {
    contentPrompt,
    files: fileList.map((f) => ({
      buffer: f.buffer,
      originalname: f.originalname,
      mimetype: f.mimetype,
    })),
    urls: urlList,
  };
}
