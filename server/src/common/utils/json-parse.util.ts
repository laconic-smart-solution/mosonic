import { UnprocessableEntityException } from '@nestjs/common';

const DEFAULT_AI_PARSE_MESSAGE = 'Could not parse AI response. Please retry.';

export function parseJsonOrThrow(
  text: string,
  message = DEFAULT_AI_PARSE_MESSAGE,
): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new UnprocessableEntityException({
      statusCode: 422,
      error: 'ValidationFailed',
      message,
    });
  }
}

export function safeJsonParse(text: string): unknown | null {
  try {
    const trimmed = text.trim();
    const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    const body = fence ? fence[1].trim() : trimmed;
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

export function parseJsonWithFenceOrThrow(
  text: string,
  message = DEFAULT_AI_PARSE_MESSAGE,
): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const body = fence ? fence[1].trim() : trimmed;
  return parseJsonOrThrow(body, message);
}
