import {
  LIVE_STATE_HEADER,
  connectedChannels,
  latestDraftText,
  latestPostPublished,
  renderLiveState,
  type LiveFacts,
} from './live-facts.util';

const base: LiveFacts = {
  workflow: null,
  activeRun: null,
  latestPost: null,
  upload: null,
  accounts: [],
  memoryCount: 2,
};

describe('renderLiveState (same text as the old inline builder)', () => {
  it('no workflow', () => {
    expect(renderLiveState(base)).toBe(
      [LIVE_STATE_HEADER, 'Workflow: none yet.', 'Connected accounts: none.', 'Saved memory notes: 2.'].join('\n'),
    );
  });

  it('full facts', () => {
    const facts: LiveFacts = {
      workflow: { status: 'ready', steps: '1. Text\n2. Image' },
      activeRun: { pipelineId: 'pl-1', status: 'running' },
      latestPost: { contentId: 'c-1', status: 'draft', hasImage: true },
      upload: {
        uploadId: 'u-1',
        status: 'partial',
        channels: [
          { channel: 'facebook', status: 'published', included: true },
          { channel: 'tiktok', status: 'pending', included: false },
        ],
      },
      accounts: [{ channel: 'facebook', label: 'facebook @brand', connected: true }],
      memoryCount: 0,
    };
    expect(renderLiveState(facts)).toBe(
      [
        LIVE_STATE_HEADER,
        'Workflow (ready), steps in execution order:',
        '1. Text\n2. Image',
        'Active run: pl-1 (running).',
        'Latest post ("that post" / "current post" / "it" means this one): content c-1, status draft, image: yes.',
        'Upload u-1 (partial): facebook:published, tiktok:pending(off).',
        'Connected accounts: facebook @brand.',
        'Saved memory notes: 0.',
      ].join('\n'),
    );
    expect(latestPostPublished(facts)).toBe(true);
  });

  it('drops the accounts line when the lookup failed, and an upload without channels', () => {
    const text = renderLiveState({
      ...base,
      workflow: { status: 'draft', steps: '(no steps)' },
      latestPost: { contentId: 'c-2', status: 'approved', hasImage: false },
      upload: { uploadId: 'u-2', status: 'pending', channels: [] },
      accounts: null,
    });
    expect(text).toContain('Active run: none.');
    expect(text).toContain('Upload u-2 (pending): no channels.');
    expect(text).not.toContain('Connected accounts');
  });

  it('ignores the upload without a latest post, and the post without a workflow', () => {
    const text = renderLiveState({
      ...base,
      latestPost: { contentId: 'c-3', status: 'draft', hasImage: false },
      upload: { uploadId: 'u-3', status: 'pending', channels: [] },
    });
    expect(text).not.toContain('Latest post');
    expect(text).not.toContain('Upload');
  });
});

describe('live fact helpers', () => {
  it('latestDraftText', () => {
    expect(latestDraftText(null)).toBeNull();
    expect(latestDraftText({ ...base, latestPost: { contentId: 'c', status: 's', hasImage: false } })).toBe(
      'content c, status s, image: no',
    );
  });

  it('connectedChannels skips needs_reauth', () => {
    const set = connectedChannels({
      ...base,
      accounts: [
        { channel: 'Facebook', label: 'facebook', connected: true },
        { channel: 'rednote', label: 'rednote needs_reauth', connected: false },
      ],
    });
    expect([...set]).toEqual(['facebook']);
  });

  it('latestPostPublished ignores excluded channels', () => {
    expect(
      latestPostPublished({
        ...base,
        upload: { uploadId: 'u', status: 'x', channels: [{ channel: 'facebook', status: 'published', included: false }] },
      }),
    ).toBe(false);
  });
});

describe('renderLiveState with graph snapshot', () => {
  it('appends the live workflow graph block', () => {
    const text = renderLiveState({
      ...base,
      workflow: { status: 'ready', steps: '1. Text\n2. Image' },
      graph: {
        hasWorkflow: true,
        status: 'ready',
        sharedImageGeneration: 0,
        totalImageGeneration: 1,
        lanes: [
          {
            lane: 'facebook',
            imageGeneration: 1,
            types: { adapt: 1, image_generation: 1 },
          },
        ],
      },
    });
    expect(text).toContain('## Workflow graph (live; overrides earlier chat claims)');
    expect(text).toContain('facebook: image_generation=1');
    expect(text).toContain('N image_generation nodes');
  });
});
