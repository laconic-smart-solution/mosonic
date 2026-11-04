import { PrismaChatMessageRepository } from './prisma-chat-message.repository';

function row(i: number) {
  return {
    messageId: `m${String(i).padStart(3, '0')}`,
    sessionId: 's1',
    role: 'user',
    content: `msg ${i}`,
    steps: null,
    inputTokens: null,
    outputTokens: null,
    createdAt: new Date(1_700_000_000_000 + Math.floor(i / 2) * 1000), // pairs share a timestamp
  };
}

/** In-memory stand-in for prisma.chatMessage that honours the where/orderBy/take the repo sends. */
function makeRepo(count: number) {
  const all = Array.from({ length: count }, (_, i) => row(i));
  const cmp = (a: ReturnType<typeof row>, b: ReturnType<typeof row>) =>
    b.createdAt.getTime() - a.createdAt.getTime() || (a.messageId < b.messageId ? 1 : -1);
  const matches = (r: ReturnType<typeof row>, where: any): boolean => {
    if (where.sessionId && r.sessionId !== where.sessionId) return false;
    if (where.messageId !== undefined) {
      if (typeof where.messageId === 'string') return r.messageId === where.messageId;
      if (where.messageId.lt && !(r.messageId < where.messageId.lt)) return false;
    }
    if (where.createdAt instanceof Date && r.createdAt.getTime() !== where.createdAt.getTime()) return false;
    if (where.createdAt?.lt && !(r.createdAt < where.createdAt.lt)) return false;
    if (where.OR) return where.OR.some((w: any) => matches(r, w));
    return true;
  };
  const prisma = {
    chatMessage: {
      findFirst: jest.fn(({ where }) => Promise.resolve(all.find((r) => matches(r, where)) ?? null)),
      findMany: jest.fn(({ where, take }) =>
        Promise.resolve(all.filter((r) => matches(r, where)).sort(cmp).slice(0, take)),
      ),
      create: jest.fn(({ data }) => Promise.resolve({ ...data, messageId: 'new' })),
    },
  };
  return { repo: new PrismaChatMessageRepository(prisma as any), prisma };
}

describe('PrismaChatMessageRepository.findPageBySessionId', () => {
  it('pages backwards through all messages without gaps or duplicates', async () => {
    const { repo } = makeRepo(75);
    const seen: string[] = [];
    let before: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await repo.findPageBySessionId('s1', { before, limit: 30 });
      pages += 1;
      // each page is oldest-first
      const ids = page.messages.map((m) => m.messageId);
      expect([...ids].sort()).toEqual(ids);
      seen.unshift(...ids);
      if (!page.hasMore) {
        expect(page.nextCursor).toBeNull();
        break;
      }
      expect(page.nextCursor).toBe(ids[0]);
      before = page.nextCursor!;
    }
    expect(pages).toBe(3);
    expect(seen).toEqual(Array.from({ length: 75 }, (_, i) => row(i).messageId));
  });

  it('returns the newest page with hasMore=false when it fits', async () => {
    const { repo } = makeRepo(5);
    const page = await repo.findPageBySessionId('s1', { limit: 30 });
    expect(page.messages).toHaveLength(5);
    expect(page).toEqual(expect.objectContaining({ hasMore: false, nextCursor: null }));
  });

  it('returns an empty page for an unknown or foreign cursor', async () => {
    const { repo, prisma } = makeRepo(5);
    const page = await repo.findPageBySessionId('s1', { before: 'nope', limit: 30 });
    expect(page).toEqual({ messages: [], hasMore: false, nextCursor: null });
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
  });
});

describe('PrismaChatMessageRepository session state column', () => {
  it('the client page and the create result leave out state; the history read keeps it', async () => {
    const { repo, prisma } = makeRepo(3);
    await repo.findPageBySessionId('s1', { limit: 30 });
    expect(prisma.chatMessage.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ omit: { state: true } }));
    await repo.findBySessionId('s1', 20);
    expect(prisma.chatMessage.findMany.mock.calls.at(-1)?.[0]).not.toHaveProperty('omit');
    await repo.create({ sessionId: 's1', role: 'assistant', content: 'x', state: { v: 1 } } as any);
    expect(prisma.chatMessage.create).toHaveBeenCalledWith(expect.objectContaining({ omit: { state: true }, data: expect.objectContaining({ state: { v: 1 } }) }));
  });
});
