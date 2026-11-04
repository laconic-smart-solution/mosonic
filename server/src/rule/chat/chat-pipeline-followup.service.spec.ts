jest.mock('../../preprocessing/preprocessing.service', () => ({
  PreprocessingService: class PreprocessingService {},
}));
jest.mock('../../preprocessing/content-reader.service', () => ({
  ContentReaderService: class ContentReaderService {},
}));
jest.mock('../rule-extraction.service', () => ({
  RuleExtractionService: class RuleExtractionService {},
}));
jest.mock('../../events/events.service', () => ({
  EventsService: class EventsService {},
}));
jest.mock('../../preprocessing/handlers/website-asset.handler', () => ({
  WebsiteAssetHandler: class WebsiteAssetHandler {},
}));
jest.mock('../../workflow/workflow.service', () => ({
  WorkflowService: class WorkflowService {},
}));
jest.mock('../../orchestration/orchestration.service', () => ({
  OrchestrationService: class OrchestrationService {},
}));
jest.mock('../../content/content.service', () => ({
  ContentService: class ContentService {},
}));
jest.mock('./chat-session.service', () => ({
  ChatSessionService: class ChatSessionService {},
}));
jest.mock('./chat-turn-lock.service', () => ({
  ChatTurnLockService: class ChatTurnLockService {},
}));

import { ChatPipelineFollowupService, startedPipelineIdsFromSteps } from './chat-pipeline-followup.service';

const auth = { userId: 'u1', role: 'CUSTOMER' } as never;

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: jest.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    quit: jest.fn(),
  };
}

function setup(opts: { lockFreeAfter?: number; pipelineStatus?: string } = {}) {
  const redis = fakeRedis();
  let attempts = 0;
  const turnLock = {
    tryAcquire: jest.fn(async () => {
      attempts += 1;
      return attempts > (opts.lockFreeAfter ?? 0) ? 'tok' : null;
    }),
    release: jest.fn(async () => undefined),
  };
  const events = { emitToChatSession: jest.fn(), onPipelineEvent: jest.fn(() => () => undefined) };
  const chat = { runPipelineFollowUp: jest.fn(async () => ({ messageId: 'm1' })) };
  const orchestration = {
    getPipeline: jest.fn(async () => ({
      pipeline: {
        pipelineId: 'p1',
        name: 'Run',
        status: opts.pipelineStatus ?? 'running',
        startedAt: new Date(Date.now() - 60000),
        completedAt: null,
        pausedNodeId: null,
        ruleRef: 'r1',
        contentId: 'c-from-snapshot',
      },
      nodes: [
        { nodeId: 'n1', type: 'text_generation', order: 1, status: 'completed', executedAt: new Date() },
        { nodeId: 'n2', type: 'image_generation', order: 2, status: 'completed', executedAt: new Date() },
      ],
    })),
  };
  const svc = new ChatPipelineFollowupService(
    {} as never,
    events as never,
    turnLock as never,
    chat as never,
    orchestration as never,
  );
  (svc as unknown as { redis: () => unknown }).redis = () => redis;
  svc.sleep = jest.fn(async () => undefined);
  return { svc, redis, turnLock, events, chat, orchestration };
}

describe('startedPipelineIdsFromSteps', () => {
  it('picks pipelineIds from successful start observations only', () => {
    expect(
      startedPipelineIdsFromSteps([
        { type: 'thought', text: 'x' },
        { type: 'observation', name: 'start_generation', toolCallId: '1', result: JSON.stringify({ ok: true, action: 'pipeline_started', pipelineId: 'p1' }) },
        { type: 'observation', name: 'start_generation', toolCallId: '2', result: JSON.stringify({ ok: false, code: 'already_running', pipelineId: 'p0' }) },
        { type: 'observation', name: 'x', toolCallId: '3', result: 'not json' },
      ]),
    ).toEqual(['p1']);
  });
});

describe('ChatPipelineFollowupService', () => {
  it('ignores events for runs not started from a chat', async () => {
    const { svc, events, chat } = setup();
    await svc.handlePipelineEvent('p1', 'pipeline:completed', { contentId: 'c1' });
    expect(events.emitToChatSession).not.toHaveBeenCalled();
    expect(chat.runPipelineFollowUp).not.toHaveBeenCalled();
  });

  it('forwards node progress to the chat room without a follow-up turn', async () => {
    const { svc, events, chat } = setup();
    await svc.watch('s1', 'p1', auth);
    events.emitToChatSession.mockClear();
    await svc.handlePipelineEvent('p1', 'node:completed', { nodeId: 'n1' });
    expect(events.emitToChatSession).toHaveBeenCalledWith(
      's1',
      'chat:run-progress',
      expect.objectContaining({ sessionId: 's1', pipelineId: 'p1', status: 'running' }),
    );
    expect(chat.runPipelineFollowUp).not.toHaveBeenCalled();
  });

  it('runs exactly one follow-up turn per pipeline (idempotent)', async () => {
    const { svc, chat, turnLock, redis } = setup();
    await svc.watch('s1', 'p1', auth);
    await svc.handlePipelineEvent('p1', 'pipeline:completed', { contentId: 'c1' });
    // a duplicate completion (second API instance / replayed bridge message)
    await svc.watch('s1', 'p1', auth);
    await svc.handlePipelineEvent('p1', 'pipeline:completed', { contentId: 'c1' });

    expect(chat.runPipelineFollowUp).toHaveBeenCalledTimes(1);
    const [sessionId, , pipelineId, observation] = chat.runPipelineFollowUp.mock.calls[0] as unknown as [string, unknown, string, Record<string, unknown>];
    expect(sessionId).toBe('s1');
    expect(pipelineId).toBe('p1');
    expect(observation).toMatchObject({ ok: true, action: 'pipeline_result', status: 'completed', contentId: 'c1', hasImage: true });
    expect(turnLock.release).toHaveBeenCalledWith('s1', 'tok');
    expect(redis.store.has('chat:run-watch:p1')).toBe(true); // re-watched above, then not re-run
  });

  it('waits with backoff while a user turn holds the lock', async () => {
    const { svc, chat, turnLock } = setup({ lockFreeAfter: 3 });
    await svc.watch('s1', 'p1', auth);
    await svc.handlePipelineEvent('p1', 'pipeline:completed', { contentId: 'c1' });
    expect(turnLock.tryAcquire).toHaveBeenCalledTimes(4);
    expect(svc.sleep).toHaveBeenCalledTimes(3);
    expect(chat.runPipelineFollowUp).toHaveBeenCalledTimes(1);
  });

  it('gives up (and logs) when the chat stays busy', async () => {
    const { svc, chat, turnLock } = setup({ lockFreeAfter: 1000 });
    await svc.watch('s1', 'p1', auth);
    await svc.handlePipelineEvent('p1', 'pipeline:completed', {});
    expect(chat.runPipelineFollowUp).not.toHaveBeenCalled();
    expect(turnLock.release).not.toHaveBeenCalled();
  });

  it('passes the failure reason and failing step on pipeline:failed', async () => {
    const { svc, chat, events, orchestration } = setup();
    orchestration.getPipeline.mockResolvedValue({
      pipeline: { pipelineId: 'p1', name: 'Run', status: 'failed', startedAt: new Date(), completedAt: null, pausedNodeId: null, ruleRef: 'r1' },
      nodes: [
        { nodeId: 'n1', type: 'text_generation', order: 1, status: 'completed', executedAt: new Date() },
        { nodeId: 'n2', type: 'image_generation', order: 2, status: 'failed', executedAt: null },
      ],
    } as never);
    await svc.watch('s1', 'p1', auth);
    await svc.handlePipelineEvent('p1', 'pipeline:failed', { message: 'Image service timed out' });

    expect(events.emitToChatSession).toHaveBeenCalledWith(
      's1',
      'chat:run-progress',
      expect.objectContaining({ status: 'failed', failedNodeId: 'n2', error: 'Image service timed out' }),
    );
    const observation = (chat.runPipelineFollowUp.mock.calls[0] as unknown[])[3];
    expect(observation).toMatchObject({ ok: false, status: 'failed', error: 'Image service timed out', hasImage: false });
  });

  it('releases the lock even when the follow-up turn throws', async () => {
    const { svc, chat, turnLock } = setup();
    chat.runPipelineFollowUp.mockRejectedValueOnce(new Error('model down'));
    await svc.watch('s1', 'p1', auth);
    await svc.handlePipelineEvent('p1', 'pipeline:completed', { contentId: 'c1' });
    expect(turnLock.release).toHaveBeenCalledWith('s1', 'tok');
  });
});
