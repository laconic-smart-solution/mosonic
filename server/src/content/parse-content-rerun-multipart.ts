import { BadRequestException } from '@nestjs/common';
import type { Express } from 'express';
import {
  mergeUrlSources,
  tryNormalizeHttpUrl,
} from '../preprocessing/url-safety';
import type { UploadedFileLike } from '../preprocessing/preprocessed.types';
import type { RerunNodeDto } from './dto/rerun-node.dto';

export type ParsedContentRerunMultipart = {
  dto: RerunNodeDto;
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

function parseJsonObjectField(
  raw: unknown,
  fieldName: string,
): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string') {
    throw new BadRequestException(`Field ${fieldName} must be a JSON object`);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException(`Field ${fieldName} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException(`Field ${fieldName} must be valid JSON`);
  }
}

/**
 * Multipart fields for POST /contents/:id/rerun-node:
 * nodeId, message?, files, urls, previousOutputs?, updatedConfig?
 */
export function parseContentRerunMultipart(
  files: Express.Multer.File[] | undefined,
  body: Record<string, unknown>,
): ParsedContentRerunMultipart {
  const nodeId = typeof body.nodeId === 'string' ? body.nodeId.trim() : '';
  if (!nodeId) {
    throw new BadRequestException('nodeId is required');
  }

  const message =
    typeof body.message === 'string' ? body.message.trim() : undefined;
  const previousOutputs = parseJsonObjectField(
    body.previousOutputs,
    'previousOutputs',
  ) as RerunNodeDto['previousOutputs'] | undefined;
  const updatedConfig = parseJsonObjectField(
    body.updatedConfig,
    'updatedConfig',
  );

  const fileList = files ?? [];
  const urlList = mergeUrlSources(message ?? '', parseUrlsField(body.urls));

  return {
    dto: {
      nodeId,
      message: message || undefined,
      previousOutputs,
      updatedConfig,
    },
    files: fileList.map((f) => ({
      buffer: f.buffer,
      originalname: f.originalname,
      mimetype: f.mimetype,
    })),
    urls: urlList,
  };
}
