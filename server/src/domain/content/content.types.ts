import type { Content, ContentStatus } from '@prisma/client';

export { ContentStatus };

export type ContentRecord = Content;

export type ContentOutputs = Record<string, unknown>;
export type ContentUserEdits = Record<string, unknown>;
