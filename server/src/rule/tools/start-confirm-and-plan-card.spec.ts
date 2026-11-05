import {
  buildGenerationPreview,
  generationPreviewPrompt,
  previewGaps,
  requestWantsVideo,
  PREVIEW_CONFIRM_OPTION_ID,
} from './generation-preview.tools';
import { affirmsPendingStartPreview, isAffirmativeReply } from './tool-guards.util';

const imageOnly = buildGenerationPreview([
  { nodeId: 'n-text', type: 'text_generation', order: 1, config: {} },
  { nodeId: 'n-img', type: 'image_generation', order: 2, config: { style: 'watercolor' } },
]);

describe('plan card shows what the user asked for', () => {
  it('detects video requests', () => {
    expect(requestWantsVideo('make a TikTok video about coffee')).toBe(true);
    expect(requestWantsVideo('make a post about coffee')).toBe(false);
  });

  it('names the real channel instead of "shared" and flags missing video + TikTok', () => {
    const gaps = previewGaps(imageOnly, { channels: ['tiktok'], wantsVideo: true, brandChannels: ['instagram'] });
    expect(gaps.channels).toEqual(['TikTok']);
    expect(gaps.missingVideo).toBe(true);
    expect(gaps.missingChannels).toEqual(['TikTok']);

    const out = JSON.parse(generationPreviewPrompt({
      topic: 'coffee',
      preview: imageOnly,
      request: { channels: ['tiktok'], wantsVideo: true, brandChannels: ['instagram'] },
    }));
    expect(out.question).not.toContain('shared');
    expect(out.question).toContain('Channels: TikTok');
    expect(out.question).toContain('Add video step + TikTok first?');
    expect(out.needsAdding).toBe(true);
    expect(out.options[0].id).toBe('add_missing');
    expect(out.options.map((o: { id: string }) => o.id)).toContain(PREVIEW_CONFIRM_OPTION_ID);
    expect(out.message).toContain('do not also ask "Start now?"');
  });

  it('no gaps: plain Start card with brand channels', () => {
    const out = JSON.parse(generationPreviewPrompt({ topic: 't', preview: imageOnly, request: { brandChannels: ['instagram'] } }));
    expect(out.question).toContain('Channels: Instagram.');
    expect(out.needsAdding).toBe(false);
    expect(out.options[0]).toEqual({ id: PREVIEW_CONFIRM_OPTION_ID, label: 'Start' });
  });
});

describe('a yes after the plan card confirms it (no double Start)', () => {
  const card = (needsAdding = false) =>
    JSON.stringify({ ok: false, code: 'preview_confirm', action: 'ask_user', confirmFor: 'start_generation', needsAdding, options: [] });
  const assistant = (result: string, content = 'Start now?') => ({
    role: 'assistant',
    content,
    steps: [{ type: 'observation', name: 'start_generation', result }],
  });

  it('reads yes / start / chip Yes as affirmative, not no', () => {
    for (const t of ['Yes', 'yes!', 'ok', 'Start now', 'User choice: yes (Yes)', '\u101f\u102f\u1010\u103a\u1000\u1032\u1037']) {
      expect(isAffirmativeReply(t)).toBe(true);
    }
    for (const t of ['no', 'User choice: cancel (Cancel)', 'make it about tea']) expect(isAffirmativeReply(t)).toBe(false);
  });

  it('typed yes right after the card', () => {
    expect(affirmsPendingStartPreview([{ role: 'user', content: 'make a post' }, assistant(card()), { role: 'user', content: 'yes' }])).toBe(true);
  });

  it('yes to the AI asking "Start now?" one turn after the card', () => {
    const h = [
      { role: 'user', content: 'make a post' },
      assistant(card()),
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'Start now?', steps: [] },
      { role: 'user', content: 'Yes' },
    ];
    expect(affirmsPendingStartPreview(h)).toBe(true);
  });

  it('not when a run already started, the card proposes adding steps, or the user said something else', () => {
    const started = JSON.stringify({ ok: true, action: 'pipeline_started' });
    expect(affirmsPendingStartPreview([assistant(card()), { role: 'user', content: 'x' }, assistant(started), { role: 'user', content: 'yes' }])).toBe(false);
    expect(affirmsPendingStartPreview([assistant(card(true)), { role: 'user', content: 'yes' }])).toBe(false);
    expect(affirmsPendingStartPreview([assistant(card()), { role: 'user', content: 'change the style' }])).toBe(false);
  });
});
