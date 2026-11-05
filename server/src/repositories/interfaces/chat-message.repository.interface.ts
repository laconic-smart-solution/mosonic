import type { ChatRole, Prisma } from '@prisma/client';

export type ChatMessageRecord = {
  messageId: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  steps: unknown;
  /**
   * Session state snapshot (assistant rows). Only findBySessionId (server-side
   * history) returns it; pages and create results omit it so it never reaches the client.
   */
  state?: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
};

/** One page of a session's messages, oldest-first; `nextCursor` loads the page before it. */
export type ChatMessagePage = {
  messages: ChatMessageRecord[];
  hasMore: boolean;
  nextCursor: string | null;
};

export interface IChatMessageRepository {
  /**
   * Page of messages older than the `before` message id (newest page when omitted),
   * ordered oldest-first. Ordered by (createdAt, messageId) so equal timestamps never skip or repeat.
   */
  findPageBySessionId(
    sessionId: string,
    opts: { before?: string; limit: number },
  ): Promise<ChatMessagePage>;
  /** Most recent `limit` messages for a session, ordered oldest-first (ready to use as conversation history). */
  findBySessionId(
    sessionId: string,
    limit?: number,
  ): Promise<ChatMessageRecord[]>;
  create(data: Prisma.ChatMessageCreateInput): Promise<ChatMessageRecord>;
}
