import {
  carriedConfirmation,
  confirmationPromptFor,
  isConfirmedByUser,
  matchesCarriedConfirmation,
  matchesApproval,
  approvalArgsKey,
  repeatedPostRequestInState,
  normalizeRequest,
  MUTATING_TOOL_NAMES,
  parseUserChoice,
  draftChannelNotTemplate,
  repeatedPostRequest,
  saveBeforeRerunFinished,
  workflowAlreadyBuilt,
  planBeforeSetupChange,
  startAfterSetupChange,
  matchesPostIntent,
  pendingPostIntent,
} from './tool-guards.util';

const askUser = (options: { id: string; label: string }[]) => [
  {
    type: 'observation',
    name: 'ask_user',
    toolCallId: 'c1',
    result: JSON.stringify({
      action: 'ask_user',
      type: 'single',
      question: 'Q?',
      options,
    }),
  },
];

const yesNo = askUser([
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
]);

describe('isConfirmedByUser', () => {
  it('accepts a positive option id or label answering the previous ask_user', () => {
    expect(
      isConfirmedByUser([
        { role: 'assistant', content: 'Q?', steps: yesNo },
        { role: 'user', content: 'Yes' },
      ]),
    ).toBe(true);
    expect(
      isConfirmedByUser([
        {
          role: 'assistant',
          content: 'Q?',
          steps: askUser([
            { id: 'approve', label: 'Approve' },
            { id: 'cancel', label: 'Cancel' },
          ]),
        },
        { role: 'user', content: 'approve' },
      ]),
    ).toBe(true);
  });

  it('rejects negative answers, free text and missing ask_user', () => {
    expect(
      isConfirmedByUser([
        { role: 'assistant', content: 'Q?', steps: yesNo },
        { role: 'user', content: 'no' },
      ]),
    ).toBe(false);
    expect(
      isConfirmedByUser([
        { role: 'assistant', content: 'Q?', steps: yesNo },
        { role: 'user', content: 'sure, and also change the caption' },
      ]),
    ).toBe(false);
    expect(
      isConfirmedByUser([
        { role: 'assistant', content: 'Approve?', steps: null },
        { role: 'user', content: 'yes' },
      ]),
    ).toBe(false);
    expect(isConfirmedByUser([{ role: 'user', content: 'yes' }])).toBe(false);
  });
});

describe('isConfirmedByUser with the client chip format', () => {
  // Same string client/src/features/chat/lib/parse-ask-user.ts formatAskUserChoice sends.
  const chip = (ids: string[], labels: string[]) =>
    `User choice: ${ids.join(', ')} (${labels.join(', ')})`;

  it('accepts a clicked Yes chip', () => {
    expect(
      isConfirmedByUser([
        { role: 'assistant', content: 'Approve?', steps: yesNo },
        { role: 'user', content: chip(['yes'], ['Yes']) },
      ]),
    ).toBe(true);
  });

  it('accepts a positive custom option chip', () => {
    expect(
      isConfirmedByUser([
        {
          role: 'assistant',
          content: 'Q?',
          steps: askUser([
            { id: 'approve_now', label: 'Approve now' },
            { id: 'cancel', label: 'Cancel' },
          ]),
        },
        { role: 'user', content: chip(['approve_now'], ['Approve now']) },
      ]),
    ).toBe(true);
  });

  it('rejects a clicked No chip and unknown ids', () => {
    expect(
      isConfirmedByUser([
        { role: 'assistant', content: 'Approve?', steps: yesNo },
        { role: 'user', content: chip(['no'], ['No']) },
      ]),
    ).toBe(false);
    expect(
      isConfirmedByUser([
        { role: 'assistant', content: 'Approve?', steps: yesNo },
        { role: 'user', content: chip(['maybe'], ['Maybe']) },
      ]),
    ).toBe(false);
  });

  it('rejects a multi-pick that includes a negative option', () => {
    const steps = askUser([
      { id: 'instagram', label: 'Instagram' },
      { id: 'cancel', label: 'Cancel' },
    ]);
    expect(
      isConfirmedByUser([
        { role: 'assistant', content: 'Q?', steps },
        { role: 'user', content: chip(['instagram', 'cancel'], ['Instagram', 'Cancel']) },
      ]),
    ).toBe(false);
  });

  it('accepts the guard-produced confirmation prompt (confirmFor)', () => {
    expect(
      isConfirmedByUser([
        {
          role: 'assistant',
          content: 'Approve this draft?',
          steps: [
            {
              type: 'observation',
              name: 'approve_content',
              toolCallId: 'c9',
              result: JSON.stringify({
                action: 'ask_user',
                type: 'yes_no',
                question: 'Approve this draft?',
                confirmFor: 'approve_content',
                options: [
                  { id: 'yes', label: 'Yes' },
                  { id: 'no', label: 'No' },
                ],
              }),
            },
          ],
        },
        { role: 'user', content: chip(['yes'], ['Yes']) },
      ]),
    ).toBe(true);
  });
});

describe('parseUserChoice', () => {
  it('parses the chip format and bare text', () => {
    expect(parseUserChoice('User choice: a, b (A, B)')).toEqual({
      ids: ['a', 'b'],
      labels: ['a', 'b'],
    });
    expect(parseUserChoice(' Yes ')).toEqual({ ids: ['yes'], labels: ['yes'] });
    expect(parseUserChoice('')).toBeNull();
  });
});

describe('MUTATING_TOOL_NAMES', () => {
  it('covers write tools and excludes read-only ones', () => {
    for (const name of [
      'update_rule',
      'approve_content',
      'start_generation',
      'generate_more_image',
      'cancel_pipeline',
    ]) {
      expect(MUTATING_TOOL_NAMES.has(name)).toBe(true);
    }
    for (const name of [
      'get_rule',
      'ask_user',
      'list_contents',
      'web_search',
    ]) {
      expect(MUTATING_TOOL_NAMES.has(name)).toBe(false);
    }
  });
});

describe('isAmbiguousBareReply', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isAmbiguousBareReply } = require('./tool-guards.util');
  const list = {
    role: 'assistant',
    content: 'I can help with:\n- a launch post\n- a short bio\n- a tagline\n- brand copy',
  };
  it('flags a bare "do" after a plain list of options', () => {
    expect(isAmbiguousBareReply([list, { role: 'user', content: 'do' }])).toBe(true);
  });
  it('does not flag a specific reply or a single offer', () => {
    expect(isAmbiguousBareReply([list, { role: 'user', content: 'the launch post' }])).toBe(false);
    expect(
      isAmbiguousBareReply([
        { role: 'assistant', content: 'Want me to make your TikTok launch post now?' },
        { role: 'user', content: 'do' },
      ]),
    ).toBe(false);
  });
});

describe('carriedConfirmation (yes survives a connect detour)', () => {
  const publishArgs = { contentId: 'content-1', channels: ['facebook'] };
  const cardTurn = {
    role: 'assistant',
    content: 'Publish this draft now?',
    steps: [
      { type: 'action', name: 'publish_now', args: publishArgs, toolCallId: 'p1' },
      { type: 'observation', name: 'publish_now', toolCallId: 'p1', result: confirmationPromptFor('publish_now', publishArgs) },
    ],
  };
  const connectTurn = {
    role: 'assistant',
    content: 'Facebook is not connected yet. Tap Connect.',
    steps: [
      { type: 'action', name: 'check_channel_auth', args: { channel: 'facebook' }, toolCallId: 'a1' },
      { type: 'observation', name: 'check_channel_auth', toolCallId: 'a1', result: '{"ok":true,"auth":"missing"}' },
      { type: 'action', name: 'start_channel_oauth', args: { channel: 'facebook' }, toolCallId: 'a2' },
      { type: 'observation', name: 'start_channel_oauth', toolCallId: 'a2', result: '{"ok":true,"action":"start_oauth","platform":"facebook"}' },
    ],
  };
  const flow = [
    { role: 'user', content: 'publish it to facebook' },
    cardTurn,
    { role: 'user', content: 'User choice: yes (Yes)' },
    connectTurn,
    { role: 'user', content: 'done' },
  ];

  it('carries the yes for the same action and target', () => {
    const carried = carriedConfirmation(flow);
    expect(carried).toMatchObject({ toolName: 'publish_now', args: publishArgs, detourChannels: ['facebook'] });
    expect(matchesCarriedConfirmation(carried, 'publish_now', publishArgs)).toBe(true);
    expect(matchesCarriedConfirmation(carried, 'publish_now', { contentId: 'content-1', channels: ['Facebook'] })).toBe(true);
  });

  it('does not cover a different action, post or wider channel list', () => {
    const carried = carriedConfirmation(flow);
    expect(matchesCarriedConfirmation(carried, 'schedule_publish', publishArgs)).toBe(false);
    expect(matchesCarriedConfirmation(carried, 'approve_content', { contentId: 'content-1' })).toBe(false);
    expect(matchesCarriedConfirmation(carried, 'publish_now', { contentId: 'content-2', channels: ['facebook'] })).toBe(false);
    expect(matchesCarriedConfirmation(carried, 'publish_now', { contentId: 'content-1', channels: ['facebook', 'tiktok'] })).toBe(false);
    // No channels = every channel on the upload: wider than what was confirmed.
    expect(matchesCarriedConfirmation(carried, 'publish_now', { contentId: 'content-1' })).toBe(false);
  });

  it('resolves a missing contentId to the latest post on either side', () => {
    const carried = carriedConfirmation([
      flow[0],
      { ...cardTurn, steps: [
        { type: 'action', name: 'publish_now', args: {}, toolCallId: 'p1' },
        { type: 'observation', name: 'publish_now', toolCallId: 'p1', result: confirmationPromptFor('publish_now', {}) },
      ] },
      ...flow.slice(2),
    ]);
    expect(matchesCarriedConfirmation(carried, 'publish_now', { contentId: 'content-1' }, { contentId: 'content-1' })).toBe(true);
    expect(matchesCarriedConfirmation(carried, 'publish_now', { contentId: 'content-9' }, { contentId: 'content-1' })).toBe(false);
    // Narrowing to the channel the detour just connected is fine.
    expect(matchesCarriedConfirmation(carried, 'publish_now', { channels: ['facebook'] })).toBe(true);
    expect(matchesCarriedConfirmation(carried, 'publish_now', { channels: ['tiktok'] })).toBe(false);
  });

  it('also carries over a failed publish and a "connect now?" question in the detour', () => {
    const failedPublish = {
      role: 'assistant',
      content: 'Connect Facebook first?',
      steps: [
        { type: 'action', name: 'publish_now', args: publishArgs, toolCallId: 'x1' },
        { type: 'observation', name: 'publish_now', toolCallId: 'x1', result: '{"ok":false,"code":"not_connected"}' },
        { type: 'action', name: 'check_channel_auth', args: { channel: 'facebook' }, toolCallId: 'x2' },
        { type: 'observation', name: 'check_channel_auth', toolCallId: 'x2', result: '{"ok":true,"auth":"missing"}' },
        { type: 'action', name: 'ask_user', args: {}, toolCallId: 'x3' },
        { type: 'observation', name: 'ask_user', toolCallId: 'x3', result: JSON.stringify({ action: 'ask_user', question: 'Connect Facebook now?', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] }) },
      ],
    };
    const history = [...flow.slice(0, 3), failedPublish, { role: 'user', content: 'User choice: yes (Yes)' }, connectTurn, { role: 'user', content: 'done' }];
    expect(carriedConfirmation(history)?.toolName).toBe('publish_now');
  });

  it('is null when there was no detour, the action already ran, or the user said no', () => {
    // Direct answer to the card: isConfirmedByUser handles it.
    expect(carriedConfirmation(flow.slice(0, 3))).toBeNull();
    expect(carriedConfirmation([...flow.slice(0, 4), { role: 'user', content: 'no' }])).toBeNull();
    expect(
      carriedConfirmation([...flow.slice(0, 2), { role: 'user', content: 'User choice: no (No)' }, ...flow.slice(3)]),
    ).toBeNull();
    const published = {
      role: 'assistant',
      content: 'Published.',
      steps: [
        ...connectTurn.steps,
        { type: 'action', name: 'publish_now', args: publishArgs, toolCallId: 'z1' },
        { type: 'observation', name: 'publish_now', toolCallId: 'z1', result: '{"ok":true,"action":"publish_started"}' },
      ],
    };
    expect(carriedConfirmation([...flow.slice(0, 3), published, { role: 'user', content: 'again' }])).toBeNull();
  });

  it('is null when the turn in between changed something else', () => {
    const other = {
      role: 'assistant',
      content: 'Updated.',
      steps: [
        ...connectTurn.steps,
        { type: 'action', name: 'update_rule', args: {}, toolCallId: 'u1' },
        { type: 'observation', name: 'update_rule', toolCallId: 'u1', result: '{"ok":true}' },
      ],
    };
    expect(carriedConfirmation([...flow.slice(0, 3), other, { role: 'user', content: 'done' }])).toBeNull();
    const chatOnly = { role: 'assistant', content: 'Sure.', steps: [] };
    expect(carriedConfirmation([...flow.slice(0, 3), chatOnly, { role: 'user', content: 'done' }])).toBeNull();
  });
});

const obs = (name: string, result: unknown) => ({
  type: 'observation',
  name,
  toolCallId: `c-${name}`,
  result: typeof result === 'string' ? result : JSON.stringify(result),
});
const codeOf = (out: string | null) => (out ? (JSON.parse(out) as { code: string }).code : null);

describe('saveBeforeRerunFinished', () => {
  it('blocks save_content after a re-run this turn', () => {
    const steps = [obs('rerun_content_node', { ok: true, action: 'pipeline_started' })];
    expect(codeOf(saveBeforeRerunFinished('save_content', steps))).toBe('rerun_pending');
  });
  it('allows save_content with no re-run this turn, and other tools after a re-run', () => {
    expect(saveBeforeRerunFinished('save_content', [obs('get_content', { ok: true })])).toBeNull();
    expect(saveBeforeRerunFinished('get_content', [obs('rerun_content_node', { ok: true })])).toBeNull();
  });
});

describe('workflowAlreadyBuilt', () => {
  it('blocks a second workflow build in the same turn', () => {
    const steps = [obs('apply_default_workflow', { ok: true, workflowId: 'wf-1' })];
    expect(codeOf(workflowAlreadyBuilt('generate_workflow', steps))).toBe('workflow_just_built');
    expect(codeOf(workflowAlreadyBuilt('apply_default_workflow', steps))).toBe('workflow_just_built');
  });
  it('allows the first build, a retry after a failed one, and start_generation after a build', () => {
    expect(workflowAlreadyBuilt('apply_default_workflow', [])).toBeNull();
    const failed = [obs('apply_default_workflow', { ok: false, code: 'workflow_exists' })];
    expect(workflowAlreadyBuilt('generate_workflow', failed)).toBeNull();
    expect(workflowAlreadyBuilt('start_generation', [obs('apply_default_workflow', { ok: true })])).toBeNull();
  });
});

describe('repeatedPostRequest', () => {
  const started = { role: 'assistant', content: 'Started.', steps: [obs('start_generation', { ok: true, action: 'pipeline_started', pipelineId: 'p1' })] };
  const ask = 'make a post about our new iced coffee';

  it('blocks the same post request right after it started', () => {
    const history = [{ role: 'user', content: ask }, started, { role: 'user', content: 'Make a post about our new iced coffee!' }];
    expect(codeOf(repeatedPostRequest(history))).toBe('already_started');
  });
  it('allows a different topic, a new attachment, a short reply, a chip answer, or no earlier start', () => {
    const base = [{ role: 'user', content: ask }, started];
    expect(repeatedPostRequest([...base, { role: 'user', content: 'make a post about our new matcha' }])).toBeNull();
    expect(repeatedPostRequest([...base, { role: 'user', content: `${ask}\n[[asset:reference_image:a1:https://x/y.png]]` }])).toBeNull();
    expect(repeatedPostRequest([...base, { role: 'user', content: 'yes' }])).toBeNull();
    expect(repeatedPostRequest([...base, { role: 'user', content: 'User choice: yes (Yes)' }])).toBeNull();
    const notStarted = { role: 'assistant', content: 'Which one?', steps: [obs('ask_user', { action: 'ask_user', options: [] })] };
    expect(repeatedPostRequest([{ role: 'user', content: ask }, notStarted, { role: 'user', content: ask }])).toBeNull();
  });
});

describe('draftChannelNotTemplate', () => {
  const input = {
    name: 'set_workflow_channels',
    userText: 'add tiktok',
    hasLatestPost: true,
    adaptBound: true,
    confirmed: false,
    turnSteps: [] as ReturnType<typeof obs>[],
  };
  it('blocks set_workflow_channels for "this draft on another channel"', () => {
    expect(codeOf(draftChannelNotTemplate(input))).toBe('use_generate_more_adapt');
    expect(codeOf(draftChannelNotTemplate({ ...input, userText: 'post this for Instagram too' }))).toBe('use_generate_more_adapt');
  });
  it('allows template changes, brand channel changes, chips, and no draft', () => {
    expect(draftChannelNotTemplate({ ...input, userText: 'add tiktok to the workflow' })).toBeNull();
    expect(draftChannelNotTemplate({ ...input, userText: 'I want to post only on facebook' })).toBeNull();
    expect(draftChannelNotTemplate({ ...input, userText: 'from now on post on linkedin' })).toBeNull();
    expect(draftChannelNotTemplate({ ...input, userText: 'User choice: yes (Yes)' })).toBeNull();
    expect(draftChannelNotTemplate({ ...input, confirmed: true })).toBeNull();
    expect(draftChannelNotTemplate({ ...input, hasLatestPost: false })).toBeNull();
    expect(draftChannelNotTemplate({ ...input, adaptBound: false })).toBeNull();
    expect(draftChannelNotTemplate({ ...input, userText: '\u0e40\u0e1e\u0e34\u0e48\u0e21 tiktok' })).toBeNull();
    expect(draftChannelNotTemplate({ ...input, turnSteps: [obs('update_rule', 'Brand profile updated.')] })).toBeNull();
    expect(draftChannelNotTemplate({ ...input, name: 'generate_more_adapt' })).toBeNull();
  });
});

describe('matchesApproval (session-state approvals)', () => {
  const args = { contentId: 'c1', channels: ['Facebook'] };
  const approval = { tool: 'publish_now', argsKey: approvalArgsKey(args), args, contentId: 'c1', confirmedTurn: 2, expiresTurn: 5 };

  it('matches the same tool and args only', () => {
    expect(matchesApproval([approval], 'publish_now', { contentId: 'c1', channels: ['facebook'] })).toBe(true);
    expect(matchesApproval([approval], 'publish_now', { contentId: 'c1', channels: ['facebook', 'tiktok'] })).toBe(false);
    expect(matchesApproval([approval], 'schedule_publish', args)).toBe(false);
    expect(matchesApproval([], 'publish_now', args)).toBe(false);
    expect(matchesApproval(null, 'publish_now', args)).toBe(false);
  });

  it('fills a missing contentId from the approval', () => {
    expect(matchesApproval([approval], 'publish_now', { channels: ['facebook'] })).toBe(true);
  });

  it('argsKey is order and case insensitive for channels', () => {
    expect(approvalArgsKey({ channels: ['TikTok', 'facebook'], contentId: 'c' })).toBe(
      approvalArgsKey({ contentId: 'c', channels: ['facebook', 'tiktok'] }),
    );
  });
});

describe('repeatedPostRequestInState', () => {
  const started = [normalizeRequest('Make a post about iced coffee!')];
  it('blocks the same request again', () => {
    expect(JSON.parse(repeatedPostRequestInState('make a post about iced coffee', started) ?? '{}')).toMatchObject({ code: 'already_started' });
  });
  it('lets other, short, chip and asset messages through', () => {
    expect(repeatedPostRequestInState('make a post about tea', started)).toBeNull();
    expect(repeatedPostRequestInState('again', [normalizeRequest('again')])).toBeNull();
    expect(repeatedPostRequestInState('User choice: start_post (Start)', started)).toBeNull();
    expect(repeatedPostRequestInState('make a post about iced coffee [[asset:a1]]', started)).toBeNull();
    expect(repeatedPostRequestInState('make a post about iced coffee', [])).toBeNull();
  });
});

describe('planBeforeSetupChange (plan_first)', () => {
  const x01a = 'website announcement for Facebook, TikTok, LinkedIn, 3 mockup images each, use my real screenshots';
  const code = (r: string | null) => (r ? JSON.parse(r).code : null);
  it('blocks channel/step changes for an unconfirmed post request', () => {
    expect(code(planBeforeSetupChange({ name: 'update_rule', args: { channels: ['tiktok'] }, userText: x01a, confirmed: false }))).toBe('plan_first');
    expect(code(planBeforeSetupChange({ name: 'set_workflow_channels', args: {}, userText: x01a, confirmed: false }))).toBe('plan_first');
    expect(code(planBeforeSetupChange({ name: 'add_workflow_node', args: {}, userText: 'make an instagram post with 2 photos', confirmed: false }))).toBe('plan_first');
  });
  it('allows them after Yes, for channel changes, step edits, and non-channel profile edits', () => {
    expect(planBeforeSetupChange({ name: 'set_workflow_channels', args: {}, userText: x01a, confirmed: true })).toBeNull();
    expect(planBeforeSetupChange({ name: 'update_rule', args: { channels: ['facebook'] }, userText: 'I want to post only on facebook', confirmed: false })).toBeNull();
    expect(planBeforeSetupChange({ name: 'add_workflow_node', args: {}, userText: 'add an image step to make posts nicer', confirmed: false })).toBeNull();
    expect(planBeforeSetupChange({ name: 'update_rule', args: { brand: 'x' }, userText: x01a, confirmed: false })).toBeNull();
    expect(planBeforeSetupChange({ name: 'start_generation', args: {}, userText: x01a, confirmed: false })).toBeNull();
  });
});

describe('startAfterSetupChange (confirm_start)', () => {
  const ok = (name: string) => [{ type: 'observation', name, result: '{"ok":true}' }];
  it('blocks start_generation after a profile/workflow change this turn unless confirmed', () => {
    expect(JSON.parse(startAfterSetupChange('start_generation', ok('update_rule'), false) as string).code).toBe('confirm_start');
    expect(JSON.parse(startAfterSetupChange('start_generation', ok('set_workflow_channels'), false) as string).code).toBe('confirm_start');
    expect(startAfterSetupChange('start_generation', ok('set_workflow_channels'), true)).toBeNull();
  });
  it('never blocks the first-post setup chain (apply_default_workflow -> start_generation)', () => {
    expect(startAfterSetupChange('start_generation', ok('apply_default_workflow'), false)).toBeNull();
    expect(startAfterSetupChange('start_generation', [{ type: 'observation', name: 'update_rule', result: '{"ok":false}' }], false)).toBeNull();
  });
});

describe('first post after brand setup (Option B, live Duco case)', () => {
  const ok = (name: string) => [{ type: 'observation', name, result: '{"ok":true}' }];
  const history = [
    { role: 'user', content: 'I want to make a post about one piece, I have no brand' },
    { role: 'assistant', content: "What's your brand called?" },
    { role: 'user', content: 'you decide' },
    { role: 'assistant', content: 'Which channels do you want to post on?' },
    { role: 'user', content: 'facebook' },
  ];
  it('finds the earlier post request until a run starts', () => {
    expect(pendingPostIntent(history)).toMatch(/one piece/);
    const started = [...history.slice(0, 4), { role: 'assistant', content: 'Started.', steps: [{ type: 'observation', name: 'start_generation', result: '{"ok":true,"action":"pipeline_started"}' }] }, { role: 'user', content: 'facebook' }];
    expect(pendingPostIntent(started)).toBeNull();
    expect(pendingPostIntent([{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'Hi' }, { role: 'user', content: 'facebook' }])).toBeNull();
  });
  it('matches content/campaign/video free-text as post intent', () => {
    expect(matchesPostIntent('create a campaign about summer')).toBe(true);
    expect(matchesPostIntent('generate a video for launch')).toBe(true);
    expect(matchesPostIntent('beauty')).toBe(false);
  });
  it('a channel answer with no workflow yet may set up and start the remembered post', () => {
    const firstPost = { hadWorkflow: false, postIntent: true, userText: 'facebook' };
    expect(startAfterSetupChange('start_generation', ok('update_rule'), false, firstPost)).toBeNull();
    // ...but not "post only on facebook" (a channel change), or once a workflow exists.
    expect(startAfterSetupChange('start_generation', ok('update_rule'), false, { ...firstPost, userText: 'I want to post only on facebook' })).not.toBeNull();
    expect(startAfterSetupChange('start_generation', ok('update_rule'), false, { ...firstPost, hadWorkflow: true })).not.toBeNull();
  });
});

