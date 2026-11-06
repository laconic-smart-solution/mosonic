import {
  buildIntentText,
  pendingFlowTools,
  selectChatTools,
  selectToolsByState,
  selectTurnTools,
} from './chat-tool-gating.util';

const wf = { hasWorkflow: true, hasActiveRun: false };

describe('selectChatTools', () => {
  it('keeps small talk to the core tools', () => {
    const tools = selectChatTools('hi there', wf);
    expect(tools.has('ask_user')).toBe(true);
    expect(tools.has('approve_content')).toBe(false);
    expect(tools.size).toBeLessThanOrEqual(8);
  });
  it('adds workflow edit tools for an edit request, with at most ~15 tools', () => {
    const tools = selectChatTools('remove the image step', wf);
    expect(tools.has('remove_workflow_node')).toBe(true);
    expect(tools.has('cancel_pipeline')).toBe(false);
  });
  it('adds pipeline tools when a run is active', () => {
    expect(selectChatTools('hi', { hasWorkflow: true, hasActiveRun: true }).has('cancel_pipeline')).toBe(true);
  });
  it('never offers workflow-bound tools before a workflow exists', () => {
    const tools = selectChatTools('make a post and approve it', { hasWorkflow: false, hasActiveRun: false });
    expect(tools.has('approve_content')).toBe(false);
    expect(tools.has('set_workflow_channels')).toBe(false);
    expect(tools.has('apply_default_workflow')).toBe(true);
  });
  it('binds start_generation for a first post with no workflow (it sets one up itself)', () => {
    const state = { hasWorkflow: false, hasContent: false, hasActiveRun: false };
    expect(selectTurnTools('I want to announce that website', state)('start_generation')).toBe(true);
    expect(selectTurnTools('show my brand', state)('start_generation')).toBe(false);
  });
  it('carries the previous turn tools into a chip answer', () => {
    const text = buildIntentText([
      { role: 'assistant', content: 'Approve this draft?', steps: [{ type: 'observation', name: 'approve_content', result: '{"ok":false,"code":"confirmation_required"}' }] },
      { role: 'user', content: 'User choice: yes (Yes)' },
    ]);
    expect(selectChatTools(text, wf).has('approve_content')).toBe(true);
  });
  it('adds publish tools for a publish request when a workflow exists', () => {
    const tools = selectChatTools('publish this to tiktok now', wf);
    expect(tools.has('publish_now')).toBe(true);
    expect(tools.has('check_channel_auth')).toBe(true);
    // Lane edits and analytics are separate groups now.
    expect(tools.has('set_workflow_channels')).toBe(false);
    expect(tools.has('get_post_analytics')).toBe(false);
  });
});

describe('selectToolsByState', () => {
  it('hides upload tools without a latest post', () => {
    const allowed = selectToolsByState({ hasWorkflow: true, hasContent: false });
    expect(allowed('publish_now')).toBe(false);
    expect(allowed('get_upload')).toBe(false);
    expect(allowed('list_channels')).toBe(true);
    expect(allowed('list_posts')).toBe(true);
  });

  it('allows upload tools when there is content', () => {
    const allowed = selectToolsByState({ hasWorkflow: true, hasContent: true });
    expect(allowed('publish_now')).toBe(true);
    expect(allowed('schedule_publish')).toBe(true);
    expect(allowed('retry_publish')).toBe(true);
    expect(allowed('add_upload_media')).toBe(true);
    expect(allowed('preview_upload')).toBe(true);
  });
});

describe('selectTurnTools (state gate + intent groups + pending flows)', () => {
  const state = { hasWorkflow: true, hasContent: true, hasActiveRun: false };

  it('binds about 15 tools for a typical publish request instead of every tool', () => {
    const allowed = selectTurnTools('publish it to facebook', state);
    expect(allowed('publish_now')).toBe(true);
    expect(allowed('check_channel_auth')).toBe(true);
    expect(allowed('web_search')).toBe(false);
    expect(allowed('forget_all')).toBe(false);
    expect(allowed('get_pipeline_logs')).toBe(false);
  });

  it('keeps a pending flow tool even when the words do not match its group', () => {
    const keep = new Set(['publish_now']);
    expect(selectTurnTools('done', state)('publish_now')).toBe(false);
    expect(selectTurnTools('done', state, keep)('publish_now')).toBe(true);
    // ...but never past the state gate.
    expect(selectTurnTools('done', { ...state, hasContent: false }, keep)('publish_now')).toBe(false);
  });

  it('does not open groups on word fragments (Facebook ≠ ok, start_channel_oauth ≠ start)', () => {
    const picked = selectChatTools('Facebook start_channel_oauth', { hasWorkflow: true, hasActiveRun: false });
    expect(picked.has('start_generation')).toBe(false);
    expect(picked.has('apply_default_workflow')).toBe(false);
    expect(picked.has('start_channel_oauth')).toBe(true);
  });

  it('includes get_active_pipeline with the run tools', () => {
    expect(selectChatTools('is it done yet?', { hasWorkflow: true, hasActiveRun: false }).has('get_active_pipeline')).toBe(true);
  });
});

describe('buildIntentText uses only the tail of a long previous reply', () => {
  it('drops an early recap so it does not open every group', () => {
    const recap = `I set up your workflow and generated a post. ${'x'.repeat(400)} Want me to schedule it?`;
    const text = buildIntentText([
      { role: 'assistant', content: recap },
      { role: 'user', content: 'yes' },
    ]);
    expect(text).toContain('schedule it?');
    expect(text).not.toContain('workflow');
  });

  it('keeps only the closing question when the reply ends with one', () => {
    const text = buildIntentText([
      { role: 'assistant', content: 'Draft ready. You can edit the caption or ask for another image. Want me to publish it to Facebook now?' },
      { role: 'user', content: 'yes' },
    ]);
    expect(text).toBe('yes\nWant me to publish it to Facebook now?');
  });
});

describe('pendingFlowTools', () => {
  it('keeps the tool a confirmation card asked about and the connect tools after an OAuth start', () => {
    const keep = pendingFlowTools([
      {
        role: 'assistant',
        content: 'Publish now?',
        steps: [
          { type: 'observation', result: '{"ok":false,"code":"confirmation_required","action":"ask_user","confirmFor":"publish_now"}' },
          { type: 'observation', result: '{"ok":true,"action":"start_oauth","platform":"facebook"}' },
        ],
      },
      { role: 'user', content: 'yes' },
    ]);
    expect([...keep]).toEqual(expect.arrayContaining(['ask_user', 'publish_now', 'check_channel_auth', 'start_channel_oauth', 'list_channels']));
  });

  it('keeps a carried confirmation tool and a confirmed plan chain', () => {
    const keep = pendingFlowTools([{ role: 'user', content: 'done' }], {
      carriedTool: 'schedule_publish',
      chain: new Set(['apply_default_workflow', 'start_generation']),
    });
    expect([...keep]).toEqual(expect.arrayContaining(['schedule_publish', 'get_upload', 'check_channel_auth', 'apply_default_workflow', 'start_generation']));
    expect(pendingFlowTools([{ role: 'user', content: 'hi' }])).toEqual(new Set(['ask_user']));
  });
});

describe('pendingFlowTools with session state', () => {
  const offTopic = [
    { role: 'assistant', content: 'Your other post finished.', steps: [] },
    { role: 'user', content: 'User choice: yes (Yes)' },
  ];
  it('legacy alone loses the card behind a follow-up row', () => {
    expect(pendingFlowTools(offTopic).has('publish_now')).toBe(false);
  });
  it('keeps the confirmed tool, connect tools and chain tools from the state', () => {
    const keep = pendingFlowTools(offTopic, {
      statePending: { connect: true, askConfirmFor: 'publish_now', chainTools: ['apply_default_workflow'], approvalTools: ['schedule_publish'] },
    });
    for (const name of ['ask_user', 'publish_now', 'schedule_publish', 'get_upload', 'check_channel_auth', 'apply_default_workflow']) {
      expect(keep.has(name)).toBe(true);
    }
  });
  it('an empty state adds nothing', () => {
    expect([...pendingFlowTools(offTopic, { statePending: { connect: false, chainTools: [], approvalTools: [] } })]).toEqual(['ask_user']);
  });
});

describe('content + upload expansions (A-D)', () => {
  const state = { hasWorkflow: true, hasContent: true, hasActiveRun: false };
  it('opens upload media tools for an attach-photo request', () => {
    const allowed = selectTurnTools('use this photo for the post [[asset:reference_image:a1:http://x]]', state);
    expect(allowed('add_upload_media')).toBe(true);
    expect(allowed('remove_upload_media')).toBe(true);
    expect(allowed('get_upload')).toBe(true);
  });
  it('opens schedule tools for a reschedule / cancel request', () => {
    expect(selectTurnTools('reschedule it to friday 9am', state)('reschedule_publish')).toBe(true);
    expect(selectTurnTools('unschedule that post', state)('cancel_schedule')).toBe(true);
  });
  it('opens preview with a publish request and edit_content for caption wording', () => {
    expect(selectTurnTools('publish it', state)('preview_upload')).toBe(true);
    expect(selectTurnTools('change the caption to Hello world', state)('edit_content')).toBe(true);
  });
  it('binds retry_publish even with no workflow, and never the old retry tools', () => {
    const allowed = selectTurnTools('retry the failed post', { hasWorkflow: false, hasContent: false, hasActiveRun: false });
    expect(allowed('retry_publish')).toBe(true);
    expect(allowed('retry_post')).toBe(false);
    expect(allowed('retry_upload')).toBe(false);
  });
  it('hides upload media tools without a post', () => {
    expect(selectTurnTools('add my photo', { ...state, hasContent: false })('add_upload_media')).toBe(false);
  });
});

describe('pendingFlowTools unfinished make_post Goal', () => {
  it('keeps start_generation from statePending.goalTools even without POST_INTENT on latest message', () => {
    const history = [
      { role: 'user', content: 'I want to make a post about One Piece' },
      { role: 'assistant', content: 'What industry?' },
      { role: 'user', content: 'beauty' },
    ];
    const keep = pendingFlowTools(history, {
      statePending: {
        connect: false,
        chainTools: [],
        approvalTools: [],
        goalTools: ['start_generation', 'apply_default_workflow'],
      },
    });
    expect(keep.has('start_generation')).toBe(true);
    expect(keep.has('apply_default_workflow')).toBe(true);
    // Latest message alone would not select post tools via intent.
    expect(selectTurnTools('beauty', { hasWorkflow: false, hasContent: false, hasActiveRun: false }, keep)('start_generation')).toBe(true);
  });
});
