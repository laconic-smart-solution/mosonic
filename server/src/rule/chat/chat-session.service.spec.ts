import { clampMessagePageLimit, oauthStartedChannels } from './chat-session.service';
import { confirmationPromptFor } from '../tools/tool-guards.util';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';

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
jest.mock('../../mcp/mcp.service', () => ({
  McpService: class McpService {},
}));
jest.mock('../../upload/upload.service', () => ({
  UploadService: class UploadService {},
}));
jest.mock('../../post/post.service', () => ({
  PostService: class PostService {},
}));
jest.mock('../../rednote/rednote.service', () => ({
  RedNoteService: class RedNoteService {},
}));
jest.mock('../../plan/plan-channel-access.service', () => ({
  PlanChannelAccessService: class PlanChannelAccessService {},
}));

import { ChatSessionService } from './chat-session.service';
import type { IChatSessionRepository } from '../../repositories/interfaces/chat-session.repository.interface';
import type { IChatMessageRepository } from '../../repositories/interfaces/chat-message.repository.interface';
import type { RuleService } from '../rule.service';
import type { RuleAssetService } from '../rule-asset.service';
import type { RuleAssetSearchService } from '../rule-asset-search.service';
import type { RuleMemoryService } from '../rule-memory.service';
import type { RuleMemorySearchService } from '../rule-memory-search.service';
import type { LlmService } from '../../llm/llm.service';
import type { EventsService } from '../../events/events.service';
import { runToolCallingLoop } from '../tools/tool-calling-loop';
import type { WorkflowService } from '../../workflow/workflow.service';
import type { OrchestrationService } from '../../orchestration/orchestration.service';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import type { ContentService } from '../../content/content.service';
import type { ChatTurnLockService } from './chat-turn-lock.service';

jest.mock('../tools/tool-calling-loop', () => ({
  runToolCallingLoop: jest.fn(),
}));

const auth = { userId: 'user-1', role: 'CUSTOMER' } as const;

function makeService(opts: {
  session?: { sessionId: string; ruleId: string | null } | null;
  history?: { role: 'user' | 'assistant'; content: string; steps?: unknown; state?: unknown }[];
  useReasoningModel?: boolean;
}) {
  const session =
    'session' in opts
      ? opts.session
      : { sessionId: 'session-1', ruleId: 'rule-1' };
  const history = (opts.history ?? []).map((m, i) => ({
    messageId: `msg-${i}`,
    sessionId: 'session-1',
    role: m.role,
    content: m.content,
    steps: m.steps ?? null,
    ...(m.state !== undefined ? { state: m.state } : {}),
    inputTokens: null,
    outputTokens: null,
    createdAt: new Date(),
  }));

  const sessions = {
    findById: jest.fn().mockResolvedValue(session),
    create: jest.fn(),
    findByRuleId: jest.fn(),
    updateById: jest.fn().mockResolvedValue(session),
    deleteById: jest.fn().mockResolvedValue(true),
  } as unknown as IChatSessionRepository;

  const messages = {
    findBySessionId: jest.fn().mockResolvedValue(history),
    findPageBySessionId: jest
      .fn()
      .mockResolvedValue({ messages: history, hasMore: false, nextCursor: null }),
    create: jest.fn().mockImplementation((data) =>
      Promise.resolve({
        messageId: 'new-msg',
        sessionId: 'session-1',
        role: data.role,
        content: data.content,
        steps: data.steps ?? null,
        // Echo like a repository without `omit` would: the service must strip it.
        ...(data.state !== undefined ? { state: data.state } : {}),
        inputTokens: data.inputTokens ?? null,
        outputTokens: data.outputTokens ?? null,
        createdAt: new Date(),
      }),
    ),
  } as unknown as IChatMessageRepository;

  const ruleService = {
    getRuleById: jest.fn().mockResolvedValue({
      ruleId: 'rule-1',
      name: 'Test Rule',
      brand: {},
      audience: {},
      campaign: {},
      channels: [],
      contentGuidelines: {},
    }),
    requestExtraction: jest.fn().mockResolvedValue({ ruleId: 'new-rule-1' }),
  } as unknown as RuleService;

  const ruleAssetService = {
    listByRule: jest.fn().mockResolvedValue([]),
  } as unknown as RuleAssetService;

  const ruleAssetSearchService = {} as RuleAssetSearchService;

  const ruleMemoryService = {
    listRecent: jest.fn().mockResolvedValue([]),
    remember: jest.fn(),
    forget: jest.fn(),
  } as unknown as RuleMemoryService;

  const ruleMemorySearchService = {
    search: jest.fn().mockResolvedValue([]),
  } as unknown as RuleMemorySearchService;

  const websiteAssetHandler =
    {} as import('../../preprocessing/handlers/website-asset.handler').WebsiteAssetHandler;

  const llm = {
    getChatModelForPlainText: jest.fn().mockReturnValue({ kind: 'fast' }),
    getReasoningChatModel: jest.fn().mockReturnValue({ kind: 'reasoning' }),
    getReasoningModelId: jest.fn().mockReturnValue('gpt-6-luna'),
    getPlainTextModelId: jest.fn().mockReturnValue('gpt-5.4-mini'),
    getContextLimit: jest.fn().mockReturnValue(128_000),
  } as unknown as LlmService;

  const config = {
    get: jest.fn((key: string) =>
      key === 'CHAT_USE_REASONING_MODEL'
        ? String(opts.useReasoningModel === true)
        : undefined,
    ),
  } as unknown as ConfigService;

  const events = {
    emitToChatSession: jest.fn(),
  } as unknown as EventsService;

  const workflows = {
    getWorkflowByRuleId: jest.fn().mockResolvedValue({
      workflow: {
        workflowId: 'wf-1',
        name: 'Test Workflow',
        status: 'ready',
        ruleRef: 'rule-1',
      },
      nodes: [],
      edges: [],
    }),
  } as unknown as WorkflowService;

  const orchestration = {
    startPipeline: jest.fn(),
    getPipeline: jest.fn(),
  } as unknown as OrchestrationService;

  const pipelines = {
    findPage: jest.fn(),
  } as unknown as IPipelineRepository;

  const contents = {
    findPage: jest.fn(),
    findById: jest.fn(),
  } as unknown as IContentRepository;

  const contentService = {
    saveContent: jest.fn(),
    approveContent: jest.fn(),
    rejectContent: jest.fn(),
    scheduleRerun: jest.fn(),
    scheduleGenerateNode: jest.fn(),
  } as unknown as ContentService;

  const turnLock = {
    tryAcquire: jest.fn().mockResolvedValue('lock-token'),
    release: jest.fn().mockResolvedValue(undefined),
  } as unknown as ChatTurnLockService;

  const credits = {
    getCreditsRemaining: jest.fn().mockResolvedValue(100),
    chargeChatTurn: jest.fn().mockResolvedValue({ creditsCharged: 1, rawCostUsd: 0.006 }),
  };

  const uploadService = {
    findUploadIdByContentRef: jest.fn(),
    findByUploadId: jest.fn(),
    publishUpload: jest.fn(),
    retryUpload: jest.fn(),
  };
  const mcpService = {
    getConnectedAccounts: jest.fn().mockResolvedValue({ accounts: [] }),
    syncAccounts: jest.fn().mockResolvedValue({ accounts: [] }),
    connectChannel: jest.fn(),
  };
  const planChannelAccess = {
    isChannelAllowed: jest.fn().mockResolvedValue(true),
  };
  const postService = {
    listPosts: jest.fn().mockResolvedValue({ posts: [], total: 0, page: 1, totalPages: 0 }),
    getPostDetail: jest.fn(),
    syncPostAnalytics: jest.fn(),
    retryPost: jest.fn(),
  };
  const redNoteService = {
    getAccountStatus: jest.fn().mockResolvedValue({
      connected: false,
      status: 'none',
      sessionStatus: null,
      lastVerifiedAt: null,
      needsReauth: false,
      handle: null,
    }),
    startConnect: jest.fn(),
  };

  const service = new ChatSessionService(
    sessions,
    messages,
    ruleService,
    ruleAssetService,
    ruleAssetSearchService,
    ruleMemoryService,
    ruleMemorySearchService,
    websiteAssetHandler,
    llm,
    config,
    events,
    workflows,
    orchestration,
    pipelines,
    contents,
    contentService,
    credits as never,
    turnLock,
    uploadService as never,
    mcpService as never,
    planChannelAccess as never,
    postService as never,
    redNoteService as never,
    {} as never,
  );

  return {
    service,
    credits,
    sessions,
    messages,
    ruleService,
    events,
    workflows,
    ruleMemoryService,
    ruleMemorySearchService,
    llm,
    turnLock,
    mcpService,
    pipelines,
    contents,
    uploadService,
    redNoteService,
  };
}

describe('ChatSessionService ownership checks', () => {
  it('throws NotFoundException when the session does not exist', async () => {
    const { service } = makeService({ session: null });
    await expect(service.sendMessage('session-1', 'hi', auth)).rejects.toThrow(
      'Chat session session-1 not found',
    );
  });

  it('enforces ownership for listMessages and deleteSession too', async () => {
    const { service } = makeService({ session: null });
    await expect(service.listMessages('session-1', auth)).rejects.toThrow(
      'Chat session session-1 not found',
    );
    await expect(service.deleteSession('session-1', auth)).rejects.toThrow(
      'Chat session session-1 not found',
    );
  });
});

describe('ChatSessionService.createSession — one session per Rule', () => {
  it('reopens the existing session instead of creating a duplicate', async () => {
    const { service, sessions } = makeService({});
    const existingSession = { sessionId: 'session-1', ruleId: 'rule-1' };
    (sessions.findByRuleId as jest.Mock).mockResolvedValue([existingSession]);

    const result = await service.createSession('rule-1', 'New chat', auth);

    expect(result).toBe(existingSession);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('creates a new session when this Rule has none yet', async () => {
    const { service, sessions } = makeService({});
    (sessions.findByRuleId as jest.Mock).mockResolvedValue([]);
    (sessions.create as jest.Mock).mockResolvedValue({
      sessionId: 'session-new',
      ruleId: 'rule-1',
    });

    const result = await service.createSession('rule-1', undefined, auth);

    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'rule-1' }),
    );
    expect(result.sessionId).toBe('session-new');
  });

  it('always creates a fresh session when no Rule is bound (onboarding)', async () => {
    const { service, sessions } = makeService({});
    (sessions.create as jest.Mock).mockResolvedValue({
      sessionId: 'session-onboarding',
      ruleId: null,
    });

    await service.createSession(undefined, undefined, auth);

    expect(sessions.findByRuleId).not.toHaveBeenCalled();
    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: null }),
    );
  });
});

describe('ChatSessionService.sendMessage history handling', () => {
  it('loads history via the message-count cap and maps roles into LangChain messages', async () => {
    const mockedLoop = runToolCallingLoop as jest.Mock;
    mockedLoop.mockResolvedValue({
      finalMessage: { content: 'AI reply' },
      messages: [],
      steps: [],
      usage: { inputTokens: 123, outputTokens: 45 },
      lastInputTokens: 100,
    });

    const { service, messages, events, credits } = makeService({
      history: [
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier answer' },
      ],
    });

    const result = await service.sendMessage('session-1', 'new question', auth);

    expect(messages.findBySessionId).toHaveBeenCalledWith('session-1', 20);
    const toolNames = mockedLoop.mock.calls
      .at(-1)?.[0]
      .tools.map((t: { name: string }) => t.name);
    // Tools are gated by state (see selectToolsByState); get_rule is never bound.
    expect(toolNames).toEqual(
      expect.arrayContaining(['update_rule', 'remember', 'ask_user', 'list_workflows']),
    );
    expect(toolNames).not.toContain('get_rule');
    expect(toolNames).not.toContain('generate_more_video');

    const loopArgs = mockedLoop.mock.calls[mockedLoop.mock.calls.length - 1][0];
    // system message + 2 history rows (the just-persisted user message is
    // included in the re-fetched history, not appended separately)
    expect(loopArgs.messages).toHaveLength(3);
    expect(loopArgs.messages[0]).toBeInstanceOf(SystemMessage);
    expect(loopArgs.messages[0].content).toContain('## How you work');
    expect(loopArgs.messages[0].content).toContain('## Live state');
    expect(loopArgs.messages[1]).toBeInstanceOf(HumanMessage);
    expect(loopArgs.messages[2]).toBeInstanceOf(AIMessage);

    expect(result.assistantMessage.content).toBe('AI reply');
    // context gauge = last call's prompt size; persisted usage stays summed
    expect(result.contextUsage).toEqual({ used: 100, limit: 128_000 });
    expect(messages.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: 'assistant',
        inputTokens: 123,
        outputTokens: 45,
      }),
    );
    expect(credits.chargeChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        sessionId: 'session-1',
        model: 'gpt-5.4-mini',
        inputTokens: 123,
        outputTokens: 45,
      }),
    );

    expect(events.emitToChatSession).toHaveBeenCalledWith(
      'session-1',
      'chat:started',
      { sessionId: 'session-1' },
    );
    expect(events.emitToChatSession).toHaveBeenCalledWith(
      'session-1',
      'chat:completed',
      expect.objectContaining({ sessionId: 'session-1' }),
    );
  });

  it('replays recent tool observations into the next turn', async () => {
    const mockedLoop = runToolCallingLoop as jest.Mock;
    mockedLoop.mockResolvedValue({
      finalMessage: { content: 'follow-up' },
      messages: [],
      steps: [],
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const { service } = makeService({
      history: [
        { role: 'user', content: 'search tone' },
        {
          role: 'assistant',
          content: 'Casual tone.',
          steps: [
            { type: 'thought', text: 'Check brand docs.' },
            {
              type: 'action',
              name: 'search_brand_assets',
              args: { query: 'tone' },
              toolCallId: 'call-1',
            },
            {
              type: 'observation',
              name: 'search_brand_assets',
              toolCallId: 'call-1',
              result: 'tone: casual',
            },
          ],
        },
      ],
    });

    await service.sendMessage('session-1', 'say more', auth);

    const loopArgs = mockedLoop.mock.calls[mockedLoop.mock.calls.length - 1][0];
    expect(
      loopArgs.messages.some((m: unknown) => m instanceof ToolMessage),
    ).toBe(true);
  });

  it('emits chat:failed and rethrows when the tool-calling loop throws', async () => {
    const mockedLoop = runToolCallingLoop as jest.Mock;
    mockedLoop.mockRejectedValue(new Error('model unavailable'));

    const { service, events } = makeService({});

    await expect(service.sendMessage('session-1', 'hi', auth)).rejects.toThrow(
      'model unavailable',
    );

    expect(events.emitToChatSession).toHaveBeenCalledWith(
      'session-1',
      'chat:failed',
      expect.objectContaining({
        sessionId: 'session-1',
        message: 'model unavailable',
      }),
    );
  });

  it('omits node-config/pipeline/content tools until this brand has a workflow', async () => {
    const mockedLoop = runToolCallingLoop as jest.Mock;
    mockedLoop.mockResolvedValue({
      finalMessage: { content: 'AI reply' },
      messages: [],
      steps: [],
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const { service, workflows } = makeService({});
    (workflows.getWorkflowByRuleId as jest.Mock).mockResolvedValue(null);

    await service.sendMessage('session-1', 'hi', auth);

    const toolNames = mockedLoop.mock.calls
      .at(-1)?.[0]
      .tools.map((t: { name: string }) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'list_workflows',
        'generate_workflow',
        'apply_default_workflow',
      ]),
    );
    expect(toolNames).not.toEqual(
      expect.arrayContaining([
        'get_node_config',
        'start_generation',
        'list_contents',
      ]),
    );
  });

  it('folds recent brand memories into the system prompt', async () => {
    const mockedLoop = runToolCallingLoop as jest.Mock;
    mockedLoop.mockResolvedValue({
      finalMessage: { content: 'AI reply' },
      messages: [],
      steps: [],
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const { service, ruleMemoryService } = makeService({});
    (ruleMemoryService.listRecent as jest.Mock).mockResolvedValue([
      {
        ruleMemoryId: 'mem-1',
        type: 'correction',
        body: 'Never suggest infographics for LinkedIn.',
      },
    ]);

    await service.sendMessage('session-1', 'hi', auth);

    expect(ruleMemoryService.listRecent).toHaveBeenCalledWith('rule-1', auth);
    const loopArgs = mockedLoop.mock.calls.at(-1)?.[0];
    expect(loopArgs.messages[0].content).toContain('## Brand memory');
    expect(loopArgs.messages[0].content).toContain(
      'Never suggest infographics for LinkedIn.',
    );
  });

  it('uses the fast chat model by default (CHAT_USE_REASONING_MODEL unset)', async () => {
    const mockedLoop = runToolCallingLoop as jest.Mock;
    mockedLoop.mockResolvedValue({
      finalMessage: { content: 'AI reply' },
      messages: [],
      steps: [],
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const { service, llm } = makeService({});
    await service.sendMessage('session-1', 'hi', auth);

    expect(llm.getChatModelForPlainText).toHaveBeenCalled();
    expect(llm.getReasoningChatModel).not.toHaveBeenCalled();
    const loopArgs = mockedLoop.mock.calls.at(-1)?.[0];
    expect(loopArgs.model).toEqual({ kind: 'fast' });
  });

  it('switches to the reasoning model when CHAT_USE_REASONING_MODEL=true', async () => {
    const mockedLoop = runToolCallingLoop as jest.Mock;
    mockedLoop.mockResolvedValue({
      finalMessage: { content: 'AI reply' },
      messages: [],
      steps: [],
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const { service, llm } = makeService({ useReasoningModel: true });
    const result = await service.sendMessage('session-1', 'hi', auth);

    expect(llm.getReasoningChatModel).toHaveBeenCalled();
    expect(llm.getChatModelForPlainText).not.toHaveBeenCalled();
    const loopArgs = mockedLoop.mock.calls.at(-1)?.[0];
    expect(loopArgs.model).toEqual({ kind: 'reasoning' });
    // context-usage limit must be looked up against the reasoning model id, not the default chat model
    expect(llm.getContextLimit).toHaveBeenCalledWith('gpt-6-luna');
    expect(result.contextUsage.limit).toBe(128_000);
  });
});

describe('ChatSessionService.sendMessage onboarding (no Rule bound yet)', () => {
  it('uses the onboarding prompt and tool set when the session has no ruleId', async () => {
    const mockedLoop = runToolCallingLoop as jest.Mock;
    mockedLoop.mockResolvedValue({
      finalMessage: { content: 'Tell me about your brand.' },
      messages: [],
      steps: [],
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const { service, ruleService } = makeService({
      session: { sessionId: 'session-1', ruleId: null },
    });

    await service.sendMessage('session-1', 'hi', auth);

    expect(ruleService.getRuleById).not.toHaveBeenCalled();

    const loopArgs = mockedLoop.mock.calls[mockedLoop.mock.calls.length - 1][0];
    expect(loopArgs.messages[0]).toBeInstanceOf(SystemMessage);
    expect(loopArgs.messages[0].content).toContain(
      'no brand profile set up yet',
    );

    const toolNames = loopArgs.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toEqual([
      'create_rule_from_intake',
      'fetch_website_assets',
      'web_search',
      'ask_user',
    ]);
    expect(toolNames).not.toContain('start_generation');
  });

  it("binds the new ruleId onto the session when create_rule_from_intake's tool runs", async () => {
    const mockedLoop = runToolCallingLoop as jest.Mock;
    mockedLoop.mockImplementation(async ({ tools }) => {
      const createRuleTool = tools.find(
        (t: { name: string }) => t.name === 'create_rule_from_intake',
      );
      await createRuleTool.invoke({
        description: 'A coffee brand called Brew Co.',
      });
      return {
        finalMessage: { content: "I'm building your brand profile." },
        messages: [],
        steps: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    });

    const { service, sessions, ruleService } = makeService({
      session: { sessionId: 'session-1', ruleId: null },
    });

    await service.sendMessage(
      'session-1',
      'We are Brew Co, a coffee brand',
      auth,
    );

    expect(ruleService.requestExtraction).toHaveBeenCalledWith(
      expect.objectContaining({ input: 'A coffee brand called Brew Co.' }),
      auth,
    );
    expect(sessions.updateById).toHaveBeenCalledWith(
      'session-1',
      { ruleId: 'new-rule-1' },
      auth,
    );
  });
});


describe('ChatSessionService.bindRuleToSession', () => {
  it('binds a ruleId onto a ruleless session', async () => {
    const { service, sessions, ruleService } = makeService({
      session: { sessionId: 'session-1', ruleId: null },
    });
    sessions.updateById.mockResolvedValue({
      sessionId: 'session-1',
      ruleId: 'rule-from-files',
      userId: 'user-1',
      title: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    ruleService.getRuleById.mockResolvedValue({ ruleId: 'rule-from-files' });

    const result = await service.bindRuleToSession('session-1', 'rule-from-files', auth);

    expect(ruleService.getRuleById).toHaveBeenCalledWith('rule-from-files', auth);
    expect(sessions.updateById).toHaveBeenCalledWith(
      'session-1',
      { ruleId: 'rule-from-files' },
      auth,
    );
    expect(result.ruleId).toBe('rule-from-files');
  });

  it('is a no-op when the session already has that ruleId', async () => {
    const { service, sessions, ruleService } = makeService({
      session: { sessionId: 'session-1', ruleId: 'rule-1' },
    });
    ruleService.getRuleById.mockResolvedValue({ ruleId: 'rule-1' });

    const result = await service.bindRuleToSession('session-1', 'rule-1', auth);

    expect(sessions.updateById).not.toHaveBeenCalled();
    expect(result.ruleId).toBe('rule-1');
  });

  it('rejects binding a different ruleId onto an already-bound session', async () => {
    const { service } = makeService({
      session: { sessionId: 'session-1', ruleId: 'rule-1' },
    });

    await expect(
      service.bindRuleToSession('session-1', 'rule-other', auth),
    ).rejects.toThrow(/already bound/i);
  });
});

describe('ChatSessionService.sendMessage per-session lock', () => {
  beforeEach(() => {
    (runToolCallingLoop as jest.Mock).mockResolvedValue({
      finalMessage: { content: 'ok' },
      messages: [],
      steps: [],
      usage: { inputTokens: 1, outputTokens: 1 },
      lastInputTokens: 1,
    });
  });

  it('throws 409 Conflict and does not persist anything when a turn is already running', async () => {
    const { service, turnLock, messages } = makeService({});
    (turnLock.tryAcquire as jest.Mock).mockResolvedValue(null);

    await expect(
      service.sendMessage('session-1', 'hi', auth),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(messages.create).not.toHaveBeenCalled();
    expect(turnLock.release).not.toHaveBeenCalled();
  });

  it('releases the lock with its token after a successful turn', async () => {
    const { service, turnLock } = makeService({});
    await service.sendMessage('session-1', 'hi', auth);
    expect(turnLock.tryAcquire).toHaveBeenCalledWith('session-1');
    expect(turnLock.release).toHaveBeenCalledWith('session-1', 'lock-token');
  });

  it('releases the lock when the turn fails', async () => {
    (runToolCallingLoop as jest.Mock).mockRejectedValue(new Error('boom'));
    const { service, turnLock } = makeService({});
    await expect(service.sendMessage('session-1', 'hi', auth)).rejects.toThrow(
      'boom',
    );
    expect(turnLock.release).toHaveBeenCalledWith('session-1', 'lock-token');
  });
});

describe('ChatSessionService.sendMessage approve/reject confirmation gate', () => {
  const askUserSteps = [
    {
      type: 'observation',
      name: 'ask_user',
      toolCallId: 'c1',
      result: JSON.stringify({
        action: 'ask_user',
        type: 'yes_no',
        question: 'Approve this post?',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
      }),
    },
  ];

  beforeEach(() => {
    (runToolCallingLoop as jest.Mock).mockResolvedValue({
      finalMessage: { content: 'ok' },
      messages: [],
      steps: [],
      usage: { inputTokens: 1, outputTokens: 1 },
      lastInputTokens: 1,
    });
  });

  function guardFromLastLoopCall() {
    const calls = (runToolCallingLoop as jest.Mock).mock.calls;
    return calls[calls.length - 1][0].guardToolCall as (
      name: string,
      args: Record<string, unknown>,
    ) => string | null;
  }

  it('blocks approve_content when the user did not answer an ask_user prompt', async () => {
    const { service } = makeService({
      history: [{ role: 'user', content: 'approve it' }],
    });
    await service.sendMessage('session-1', 'approve it', auth);
    const guard = guardFromLastLoopCall();
    // The blocked call becomes the confirmation card (an ask_user prompt), so
    // the turn never ends with "tap Yes" text and no buttons (I-07).
    expect(JSON.parse(guard('approve_content', {}) ?? '{}')).toMatchObject({
      ok: false,
      code: 'confirmation_required',
      action: 'ask_user',
      type: 'yes_no',
      confirmFor: 'approve_content',
      question: 'Approve this draft?',
    });
    expect(guard('reject_content', {})).not.toBeNull();
    expect(guard('get_content', {})).toBeNull();
  });

  it('allows approve_content when the user clicked yes on the previous ask_user', async () => {
    const { service } = makeService({
      history: [
        {
          role: 'assistant',
          content: 'Approve this post?',
          steps: askUserSteps,
        },
        { role: 'user', content: 'yes' },
      ],
    });
    await service.sendMessage('session-1', 'yes', auth);
    expect(guardFromLastLoopCall()('approve_content', {})).toBeNull();
  });

  it('allows approve_content when the user clicked the Yes chip (client format, I-01)', async () => {
    const { service } = makeService({
      history: [
        {
          role: 'assistant',
          content: 'Approve this post?',
          steps: askUserSteps,
        },
        { role: 'user', content: 'User choice: yes (Yes)' },
      ],
    });
    await service.sendMessage('session-1', 'User choice: yes (Yes)', auth);
    expect(guardFromLastLoopCall()('approve_content', {})).toBeNull();
    expect(guardFromLastLoopCall()('reject_content', {})).toBeNull();
  });

  it('keeps blocking when the user clicked the No chip', async () => {
    const { service } = makeService({
      history: [
        {
          role: 'assistant',
          content: 'Approve this post?',
          steps: askUserSteps,
        },
        { role: 'user', content: 'User choice: no (No)' },
      ],
    });
    await service.sendMessage('session-1', 'User choice: no (No)', auth);
    expect(guardFromLastLoopCall()('approve_content', {})).not.toBeNull();
  });

  it('keeps blocking when the user answered no', async () => {
    const { service } = makeService({
      history: [
        {
          role: 'assistant',
          content: 'Approve this post?',
          steps: askUserSteps,
        },
        { role: 'user', content: 'no' },
      ],
    });
    await service.sendMessage('session-1', 'no', auth);
    expect(guardFromLastLoopCall()('approve_content', {})).not.toBeNull();
  });

  describe('a yes carried through a connect detour (publish → connect → done)', () => {
    const publishArgs = { contentId: 'content-1', channels: ['facebook'] };
    const detourHistory = [
      { role: 'user' as const, content: 'publish it to facebook' },
      {
        role: 'assistant' as const,
        content: 'Publish this draft now?',
        steps: [
          { type: 'action', name: 'publish_now', args: publishArgs, toolCallId: 'p1' },
          { type: 'observation', name: 'publish_now', toolCallId: 'p1', result: confirmationPromptFor('publish_now', publishArgs) },
        ],
      },
      { role: 'user' as const, content: 'User choice: yes (Yes)' },
      {
        role: 'assistant' as const,
        content: 'Facebook is not connected yet. Tap Connect.',
        steps: [
          { type: 'action', name: 'start_channel_oauth', args: { channel: 'facebook' }, toolCallId: 'a1' },
          { type: 'observation', name: 'start_channel_oauth', toolCallId: 'a1', result: '{"ok":true,"action":"start_oauth","platform":"facebook"}' },
        ],
      },
      { role: 'user' as const, content: 'done' },
    ];

    it('lets the same publish through without a second card, but nothing else', async () => {
      const { service } = makeService({ history: detourHistory });
      await service.sendMessage('session-1', 'done', auth);
      const guard = guardFromLastLoopCall();
      expect(guard('publish_now', publishArgs)).toBeNull();
      expect(guard('publish_now', { contentId: 'content-1', channels: ['facebook', 'tiktok'] })).not.toBeNull();
      expect(guard('schedule_publish', publishArgs)).not.toBeNull();
      expect(guard('approve_content', { contentId: 'content-1' })).not.toBeNull();
    });

    it('keeps publish_now and the connect tools bound on the "done" turn', async () => {
      const { service, pipelines, contents, uploadService } = makeService({ history: detourHistory });
      uploadService.findUploadIdByContentRef.mockRejectedValue(new Error('no upload yet'));
      (pipelines.findPage as jest.Mock).mockResolvedValue({
        rows: [{ pipelineId: 'pl-1', workflowRef: 'wf-1', status: 'completed', startedAt: new Date() }],
        total: 1,
      });
      (contents as unknown as { findLatestByPipeline: jest.Mock }).findLatestByPipeline = jest.fn().mockResolvedValue({
        contentId: 'content-1',
        pipelineRef: 'pl-1',
        workflowRef: 'wf-1',
        status: 'draft',
        outputs: {},
        userEdits: null,
        nodeOutputs: {},
        nodeUserEdits: {},
      });
      await service.sendMessage('session-1', 'done', auth);
      const call = (runToolCallingLoop as jest.Mock).mock.calls.at(-1)[0];
      const names = call.tools.map((t: { name: string }) => t.name);
      expect(names).toEqual(expect.arrayContaining(['publish_now', 'check_channel_auth', 'ask_user']));
      // "done" alone matches no intent group: the detour keep-set is what binds these.
      expect(names).not.toContain('generate_more_image');
      // A call without contentId resolves to the latest post the yes was for.
      expect(call.guardToolCall('publish_now', { channels: ['facebook'] })).toBeNull();
    });

    it('force-refreshes connected accounts from Zernio after the OAuth start, retrying once', async () => {
      const { service, mcpService } = makeService({ history: detourHistory });
      (service as unknown as { oauthRefreshRetryMs: number }).oauthRefreshRetryMs = 0;
      mcpService.syncAccounts
        .mockResolvedValueOnce({ accounts: [] })
        .mockResolvedValueOnce({ accounts: [{ channel: 'facebook', username: 'brand' }] });
      mcpService.getConnectedAccounts.mockResolvedValue({ accounts: [{ channel: 'facebook', username: 'brand' }] });
      await service.sendMessage('session-1', 'done', auth);
      expect(mcpService.syncAccounts).toHaveBeenCalledTimes(2);
      expect(mcpService.syncAccounts).toHaveBeenCalledWith('user-1');
      const prompt = String((runToolCallingLoop as jest.Mock).mock.calls.at(-1)[0].messages[0].content);
      expect(prompt).toContain('Connected accounts: facebook @brand.');
    });

    it('does not call Zernio when the previous turn started no OAuth', async () => {
      const { service, mcpService } = makeService({ history: [{ role: 'user', content: 'hi' }] });
      await service.sendMessage('session-1', 'hi', auth);
      expect(mcpService.syncAccounts).not.toHaveBeenCalled();
    });

    it('still answers when the refresh fails', async () => {
      const { service, mcpService } = makeService({ history: detourHistory });
      mcpService.syncAccounts.mockRejectedValue(new Error('zernio down'));
      await expect(service.sendMessage('session-1', 'done', auth)).resolves.toBeDefined();
      expect(mcpService.syncAccounts).toHaveBeenCalledTimes(1);
    });
  });
});

describe('oauthStartedChannels', () => {
  it('lists channels the previous assistant turn opened OAuth for', () => {
    expect(
      oauthStartedChannels([
        { role: 'assistant', steps: [{ type: 'observation', result: '{"ok":true,"action":"start_oauth","platform":"Facebook"}' }] },
        { role: 'user' },
      ]),
    ).toEqual(['facebook']);
    expect(oauthStartedChannels([{ role: 'assistant', steps: [{ type: 'observation', result: 'nope' }] }, { role: 'user' }])).toEqual([]);
    expect(oauthStartedChannels([{ role: 'user' }])).toEqual([]);
  });
});

describe('ChatSessionService.listMessages pagination', () => {
  it('returns the newest page with the default page size', async () => {
    const { service, messages } = makeService({});
    const page = await service.listMessages('session-1', auth);
    expect(messages.findPageBySessionId).toHaveBeenCalledWith('session-1', {
      before: undefined,
      limit: 30,
    });
    expect(page).toEqual(expect.objectContaining({ hasMore: false, nextCursor: null }));
  });

  it('passes the cursor and clamps the limit', async () => {
    const { service, messages } = makeService({});
    await service.listMessages('session-1', auth, { before: 'msg-9', limit: 500 });
    expect(messages.findPageBySessionId).toHaveBeenLastCalledWith('session-1', {
      before: 'msg-9',
      limit: 100,
    });
    await service.listMessages('session-1', auth, { limit: Number('abc') });
    expect(messages.findPageBySessionId).toHaveBeenLastCalledWith('session-1', {
      before: undefined,
      limit: 30,
    });
  });

  it('clampMessagePageLimit handles edge values', () => {
    expect(clampMessagePageLimit()).toBe(30);
    expect(clampMessagePageLimit(0)).toBe(30);
    expect(clampMessagePageLimit(12.7)).toBe(12);
    expect(clampMessagePageLimit(101)).toBe(100);
  });
});


describe('ChatSessionService session state', () => {
  const publishArgs = { contentId: 'content-1', channels: ['facebook'] };
  const publishCard = {
    role: 'assistant' as const,
    content: 'Publish this draft now?',
    steps: [
      { type: 'action', name: 'publish_now', args: publishArgs, toolCallId: 'p1' },
      { type: 'observation', name: 'publish_now', toolCallId: 'p1', result: confirmationPromptFor('publish_now', publishArgs) },
    ],
  };
  const followUpRow = {
    role: 'assistant' as const,
    content: 'Your other post finished.',
    steps: [
      { type: 'action', name: 'pipeline_result', args: { pipelineId: 'pl-9' }, toolCallId: 'pipeline-result-pl-9' },
      { type: 'observation', name: 'pipeline_result', toolCallId: 'pipeline-result-pl-9', result: '{"ok":true,"action":"pipeline_result","pipelineId":"pl-9","status":"completed"}' },
    ],
  };
  const okLoop = (steps: unknown[] = []) => ({
    finalMessage: { content: 'ok' },
    messages: [],
    steps,
    usage: { inputTokens: 1, outputTokens: 1 },
    lastInputTokens: 1,
  });
  function withLatestPost(svc: ReturnType<typeof makeService>) {
    svc.uploadService.findUploadIdByContentRef.mockRejectedValue(new Error('no upload yet'));
    (svc.pipelines.findPage as jest.Mock).mockResolvedValue({
      rows: [{ pipelineId: 'pl-1', workflowRef: 'wf-1', status: 'completed', startedAt: new Date() }],
      total: 1,
    });
    (svc.contents as unknown as { findLatestByPipeline: jest.Mock }).findLatestByPipeline = jest.fn().mockResolvedValue({
      contentId: 'content-1', pipelineRef: 'pl-1', workflowRef: 'wf-1', status: 'draft',
      outputs: {}, userEdits: null, nodeOutputs: {}, nodeUserEdits: {},
    });
    return svc;
  }
  const lastLoopCall = () => (runToolCallingLoop as jest.Mock).mock.calls.at(-1)[0];
  const lastCreateData = (messages: IChatMessageRepository) =>
    (messages.create as jest.Mock).mock.calls.at(-1)[0];

  beforeEach(() => {
    (runToolCallingLoop as jest.Mock).mockReset();
    (runToolCallingLoop as jest.Mock).mockResolvedValue(okLoop());
  });

  it('a pipeline follow-up row between the card and Yes keeps the confirmation', async () => {
    const { service } = withLatestPost(makeService({
      history: [
        { role: 'user', content: 'publish it to facebook' },
        publishCard,
        followUpRow,
        { role: 'user', content: 'User choice: yes (Yes)' },
      ],
    }));
    await service.sendMessage('session-1', 'User choice: yes (Yes)', auth);
    const call = lastLoopCall();
    expect(call.guardToolCall('publish_now', publishArgs, [])).toBeNull();
    expect(call.tools.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(['publish_now']));
  });

  it('still blocks after a follow-up row when the user tapped No', async () => {
    const { service } = makeService({
      history: [
        { role: 'user', content: 'publish it to facebook' },
        publishCard,
        followUpRow,
        { role: 'user', content: 'User choice: no (No)' },
      ],
    });
    await service.sendMessage('session-1', 'User choice: no (No)', auth);
    expect(lastLoopCall().guardToolCall('publish_now', publishArgs, [])).not.toBeNull();
  });

  it('carries the yes through connect + a follow-up row, and refreshes accounts', async () => {
    const { service, mcpService } = withLatestPost(makeService({
      history: [
        { role: 'user', content: 'publish it to facebook' },
        publishCard,
        { role: 'user', content: 'User choice: yes (Yes)' },
        {
          role: 'assistant',
          content: 'Facebook is not connected yet. Tap Connect.',
          steps: [
            { type: 'action', name: 'start_channel_oauth', args: { channel: 'facebook' }, toolCallId: 'a1' },
            { type: 'observation', name: 'start_channel_oauth', toolCallId: 'a1', result: '{"ok":true,"action":"start_oauth","platform":"facebook"}' },
          ],
        },
        followUpRow,
        { role: 'user', content: 'done' },
      ],
    }));
    (service as unknown as { oauthRefreshRetryMs: number }).oauthRefreshRetryMs = 0;
    await service.sendMessage('session-1', 'done', auth);
    const call = lastLoopCall();
    expect(call.guardToolCall('publish_now', publishArgs, [])).toBeNull();
    expect(call.guardToolCall('publish_now', { contentId: 'content-1', channels: ['tiktok'] }, [])).not.toBeNull();
    expect(call.guardToolCall('approve_content', { contentId: 'content-1' }, [])).not.toBeNull();
    expect(mcpService.syncAccounts).toHaveBeenCalled();
    const names = call.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(['publish_now', 'check_channel_auth']));
  });

  it('uses a stored approval from the snapshot', async () => {
    const stored = {
      v: 1,
      turn: 4,
      stage: 'post_ready',
      pending: [],
      approvals: [{ tool: 'publish_now', argsKey: '{}', args: publishArgs, confirmedTurn: 3, expiresTurn: 6 }],
      choices: [],
      recent: [],
    };
    const { service } = makeService({
      history: [
        { role: 'assistant', content: 'Connect Facebook first.', steps: [], state: stored },
        { role: 'user', content: 'ok now go' },
      ],
    });
    await service.sendMessage('session-1', 'ok now go', auth);
    const guard = lastLoopCall().guardToolCall;
    expect(guard('publish_now', publishArgs, [])).toBeNull();
    expect(guard('schedule_publish', publishArgs, [])).not.toBeNull();
  });

  it('persists the state on the assistant row, never returns or emits it', async () => {
    (runToolCallingLoop as jest.Mock).mockResolvedValue(
      okLoop([
        { type: 'action', name: 'ask_user', args: {}, toolCallId: 'q1' },
        {
          type: 'observation',
          name: 'ask_user',
          toolCallId: 'q1',
          result: JSON.stringify({ ok: true, action: 'ask_user', question: 'Which tone?', options: [{ id: 'fun', label: 'Fun' }, { id: 'calm', label: 'Calm' }] }),
        },
      ]),
    );
    const { service, messages, events } = makeService({ history: [{ role: 'user', content: 'make a post' }] });
    const result = await service.sendMessage('session-1', 'make a post', auth);
    const data = lastCreateData(messages);
    expect(data.role).toBe('assistant');
    expect(data.state).toMatchObject({ v: 1, turn: 1, pending: [expect.objectContaining({ kind: 'ask', optionIds: ['fun', 'calm'] })] });
    expect(result.assistantMessage).not.toHaveProperty('state');
    expect(result).not.toHaveProperty('sessionState');
    const completed = (events.emitToChatSession as jest.Mock).mock.calls.find((c) => c[1] === 'chat:completed');
    expect(completed[2].assistantMessage).not.toHaveProperty('state');
  });

  it('returns the state only to the eval dry-run harness', async () => {
    const { service } = makeService({ history: [{ role: 'user', content: 'hello there' }] });
    const result = await service.sendMessage('session-1', 'hello there', auth, { evalDryRun: true });
    expect(result).toMatchObject({ evalDryRun: true, sessionState: { v: 1, turn: 1 } });
    expect(result.assistantMessage).not.toHaveProperty('state');
  });

  it('writes no state when the turn fails', async () => {
    (runToolCallingLoop as jest.Mock).mockRejectedValue(new Error('model down'));
    const { service, messages } = makeService({ history: [{ role: 'user', content: 'make a post' }] });
    await expect(service.sendMessage('session-1', 'make a post', auth)).rejects.toThrow('model down');
    const calls = (messages.create as jest.Mock).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].role).toBe('user');
    expect(calls[0][0]).not.toHaveProperty('state');
  });

  it('shows the Session state block under Live state', async () => {
    const { service } = makeService({
      history: [
        { role: 'user', content: 'publish it to facebook' },
        publishCard,
        followUpRow,
        { role: 'user', content: 'User choice: yes (Yes)' },
      ],
    });
    await service.sendMessage('session-1', 'User choice: yes (Yes)', auth);
    const prompt = String(lastLoopCall().messages[0].content);
    const live = prompt.indexOf('## Live state');
    const block = prompt.indexOf('## Session state (server-kept; earlier turns)');
    expect(live).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(live);
    expect(prompt).toContain('Approvals: publish_now confirmed');
  });

  it('a follow-up keeps the pending card and marks the run announced', async () => {
    (runToolCallingLoop as jest.Mock).mockResolvedValue(okLoop());
    const { service, messages, events } = makeService({
      history: [
        { role: 'user', content: 'publish it to facebook' },
        publishCard,
      ],
    });
    const row = await service.runPipelineFollowUp('session-1', auth, 'pl-9', { ok: true, action: 'pipeline_result', pipelineId: 'pl-9', status: 'completed' });
    const data = lastCreateData(messages);
    expect(data.state.pending).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'ask', confirmFor: 'publish_now' })]),
    );
    expect(data.state.turn).toBe(1);
    expect(row).not.toHaveProperty('state');
    const completed = (events.emitToChatSession as jest.Mock).mock.calls.find((c) => c[1] === 'chat:completed');
    expect(completed[2].assistantMessage).not.toHaveProperty('state');
  });

  it('after a RedNote QR, re-checks RedNote and does not call Zernio', async () => {
    const { service, mcpService, redNoteService } = makeService({
      history: [
        {
          role: 'assistant',
          content: 'Scan the QR.',
          steps: [
            { type: 'action', name: 'start_channel_oauth', args: { channel: 'rednote' }, toolCallId: 'r1' },
            { type: 'observation', name: 'start_channel_oauth', toolCallId: 'r1', result: '{"ok":true,"action":"start_rednote_qr","platform":"rednote"}' },
          ],
        },
        { role: 'user', content: 'done' },
      ],
    });
    (service as unknown as { oauthRefreshRetryMs: number }).oauthRefreshRetryMs = 0;
    redNoteService.getAccountStatus.mockClear();
    await service.sendMessage('session-1', 'done', auth);
    expect(mcpService.syncAccounts).not.toHaveBeenCalled();
    // once for the refresh, once for Live state
    expect(redNoteService.getAccountStatus).toHaveBeenCalledTimes(2);
    const names = lastLoopCall().tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(['check_channel_auth']));
  });

  it('blocks a repeat of a post request older than the 7-row window', async () => {
    const started = {
      role: 'assistant' as const,
      content: 'Started.',
      steps: [
        { type: 'action', name: 'start_generation', args: {}, toolCallId: 's1' },
        { type: 'observation', name: 'start_generation', toolCallId: 's1', result: '{"ok":true,"action":"pipeline_started","pipelineId":"dryrun-1","dryRun":true}' },
      ],
    };
    const filler = Array.from({ length: 4 }, (_, i) => [
      { role: 'user' as const, content: `question ${i}` },
      { role: 'assistant' as const, content: `answer ${i}` },
    ]).flat();
    const { service } = makeService({
      history: [
        { role: 'user', content: 'make a post about iced coffee' },
        started,
        ...filler,
        { role: 'user', content: 'make a post about iced coffee' },
      ],
    });
    await service.sendMessage('session-1', 'make a post about iced coffee', auth);
    const blocked = lastLoopCall().guardToolCall('start_generation', {}, []);
    expect(JSON.parse(blocked ?? '{}')).toMatchObject({ code: 'already_started' });
  });
});

describe('oauthStartedChannels (RedNote QR)', () => {
  it('lists rednote after a start_rednote_qr', () => {
    expect(
      oauthStartedChannels([
        { role: 'assistant', steps: [{ type: 'observation', result: '{"ok":true,"action":"start_rednote_qr","platform":"rednote"}' }] },
        { role: 'user' },
      ]),
    ).toEqual(['rednote']);
  });
});
