import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isMultiStepRequest } from '../chat/multi-step.util';
import { correctFakeStartClaim, latestUserScript, withLanguageHint } from './tool-calling-loop';
import { confirmationPromptFor, isAmbiguousBareReply, isConfirmedByUser } from './tool-guards.util';

describe('chat loop round fixes', () => {
  it('detects the script of the latest user message', () => {
    expect(latestUserScript([new SystemMessage('x'), new HumanMessage('hi'), new HumanMessage('\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35')])).toBe('th');
    expect(latestUserScript([new HumanMessage('\u4f60\u597d')])).toBe('zh');
    expect(latestUserScript([new HumanMessage('\u1019\u1004\u103a\u1039\u1002\u101c\u102c\u1015\u102b')])).toBe('my');
    expect(latestUserScript([new HumanMessage('\u4f60\u597d'), new HumanMessage('hello')])).toBeNull();
    expect(withLanguageHint('x', 'th')).toContain('reply in Thai');
    expect(withLanguageHint('x', null)).toBe('x');
  });

  it('treats a bare word that matches none of 3+ offered buttons as ambiguous', () => {
    const steps = [{ type: 'observation', name: 'ask_user', result: JSON.stringify({ action: 'ask_user', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] }) }];
    expect(isAmbiguousBareReply([{ role: 'assistant', content: 'pick', steps }, { role: 'user', content: 'do' }])).toBe(true);
    expect(isAmbiguousBareReply([{ role: 'assistant', content: 'pick', steps }, { role: 'user', content: 'a' }])).toBe(false);
    expect(isAmbiguousBareReply([{ role: 'assistant', content: 'Options:\n1. Post\n2. Check', steps: [] }, { role: 'user', content: 'ok' }])).toBe(true);
  });

  it('asks before fetching website assets, and Skip is not a confirmation', () => {
    const prompt = confirmationPromptFor('fetch_website_assets', { url: 'https://shop.test' });
    const parsed = JSON.parse(prompt);
    expect(parsed.question).toBe('Use this site for your brand assets?');
    expect(parsed.options.map((o: { id: string }) => o.id)).toEqual(['use', 'skip']);
    const steps = [{ type: 'observation', name: 'fetch_website_assets', result: prompt }];
    expect(isConfirmedByUser([{ role: 'assistant', content: '', steps }, { role: 'user', content: 'User choice: use (Use it)' }])).toBe(true);
    expect(isConfirmedByUser([{ role: 'assistant', content: '', steps }, { role: 'user', content: 'User choice: skip (Skip)' }])).toBe(false);
  });

  it('replaces a "started" claim when no run started', () => {
    expect(correctFakeStartClaim('I started the post.', [])).toBe("The post hasn't started yet. Want me to start it now?");
    const ok = [{ type: 'observation', name: 'start_generation', result: '{"ok":true,"action":"pipeline_started"}' }] as never[];
    expect(correctFakeStartClaim('Started. You can follow along below.', ok)).toBe('Started. You can follow along below.');
  });

  it('keeps a reply after a real content re-run', () => {
    const rerun = [
      {
        type: 'observation',
        name: 'rerun_content_node',
        result:
          '{"ok":true,"action":"content_rerun_started","pendingNodeId":"img-1","pendingNodeType":"image_generation"}',
      },
    ] as never[];
    expect(
      correctFakeStartClaim('I started updating the image. Watch the card below.', rerun),
    ).toBe('I started updating the image. Watch the card below.');
  });

  it('plans only multi-step requests', () => {
    expect(isMultiStepRequest('build a full campaign for valentines')).toBe(true);
    expect(isMultiStepRequest('set up my brand, create the workflow and make a post')).toBe(true);
    expect(isMultiStepRequest('make a post')).toBe(false);
    expect(isMultiStepRequest('show me the workflow')).toBe(false);
  });

  it('does not let a reply claim a change when no tool ran', () => {
    expect(correctFakeStartClaim('Done. I removed all saved notes.', [])).toMatch(/haven't changed anything/);
    expect(correctFakeStartClaim("I've noted that you don't use red.", [])).toMatch(/haven't changed anything/);
    const ran = [{ type: 'observation', name: 'forget_all', result: '{"ok":true,"removed":2}' }] as never[];
    expect(correctFakeStartClaim('Done. I removed all saved notes.', ran)).toBe('Done. I removed all saved notes.');
  });
});
