import { BadRequestException } from '@nestjs/common';
import type { Express } from 'express';
import type { RuleExtractRequest } from './extract-request.types';
import { hasMeaningfulGuidedIntake } from './rule-intake-merge.util';
import { ruleIntakeAnswersSchema } from './rule-intake.zod';
import type { RuleIntakeAnswers } from './rule-intake.types';

export function parseUrlsMultipart(urlsRaw: unknown): string[] {
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
    return parsed.filter(
      (u): u is string => typeof u === 'string' && u.trim().length > 0,
    );
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('urls must be valid JSON');
  }
}

export function parseIntakeMultipart(intakeRaw: unknown): RuleIntakeAnswers | undefined {
  if (intakeRaw === undefined || intakeRaw === null || intakeRaw === '') {
    return undefined;
  }
  if (typeof intakeRaw !== 'string') {
    throw new BadRequestException('Field intake must be a JSON object string');
  }
  try {
    const parsed = JSON.parse(intakeRaw) as unknown;
    const result = ruleIntakeAnswersSchema.safeParse(parsed);
    if (!result.success) {
      throw new BadRequestException('intake must be a valid RuleIntakeAnswers object');
    }
    return result.data;
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('intake must be valid JSON');
  }
}

export function parseRuleExtractMultipart(
  files: Express.Multer.File[] | undefined,
  input: unknown,
  urlsRaw: unknown,
  intakeRaw?: unknown,
): RuleExtractRequest {
  const trimmedInput = typeof input === 'string' ? input.trim() : '';
  const urlList = parseUrlsMultipart(urlsRaw);
  const fileList = files ?? [];
  const intake = parseIntakeMultipart(intakeRaw);

  const hasSources =
    trimmedInput.length > 0 || fileList.length > 0 || urlList.length > 0;
  const hasGuidedIntake = intake ? hasMeaningfulGuidedIntake(intake) : false;

  if (!hasSources && !hasGuidedIntake) {
    throw new BadRequestException(
      'Provide non-empty input, at least one file, urls, or guided intake with purpose/channels/brand details',
    );
  }

  if (intake?.mode === 'express' && !hasSources) {
    throw new BadRequestException(
      'Express mode requires non-empty input, at least one file, or urls',
    );
  }

  return {
    input: trimmedInput,
    files: fileList.map((f) => ({
      buffer: f.buffer,
      originalname: f.originalname,
      mimetype: f.mimetype,
    })),
    urls: urlList,
    intake,
  };
}
