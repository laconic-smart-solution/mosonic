import { selectChatTools, selectTurnTools } from './chat-tool-gating.util';

describe('video tool gating', () => {
  const wf = { hasWorkflow: true, hasActiveRun: false };

  it('binds both video tools for a video request', () => {
    const tools = selectChatTools('make a presenter video for this post', wf);
    expect(tools.has('generate_presenter_video')).toBe(true);
    expect(tools.has('generate_cinematic_video')).toBe(true);
  });

  it('does not bind them for small talk or without a workflow', () => {
    expect(selectChatTools('hi there', wf).has('generate_cinematic_video')).toBe(false);
    expect(
      selectChatTools('make a video', { hasWorkflow: false, hasActiveRun: false }).has('generate_presenter_video'),
    ).toBe(false);
  });

  it('needs an existing draft', () => {
    const noDraft = selectTurnTools('make a cinematic video', { hasWorkflow: true, hasContent: false, hasActiveRun: false });
    expect(noDraft('generate_cinematic_video')).toBe(false);
    const withDraft = selectTurnTools('make a cinematic video', { hasWorkflow: true, hasContent: true, hasActiveRun: false });
    expect(withDraft('generate_cinematic_video')).toBe(true);
  });
});
