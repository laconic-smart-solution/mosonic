import { mergeResolvedOutputs } from './content-output.utils';

describe('mergeResolvedOutputs', () => {
  it('prefers user edits over AI outputs when user value is set', () => {
    const merged = mergeResolvedOutputs({
      outputs: { keywords: 'kw1', text: 'from-ai', image: 'img-ai' },
      userEdits: { text: 'from-user' },
    });
    expect(merged.keywords).toBe('kw1');
    expect(merged.text).toBe('from-user');
    expect(merged.image).toBe('img-ai');
  });

  it('falls back to AI output when user edit is absent', () => {
    const merged = mergeResolvedOutputs({
      outputs: { summary: 'ai-summary' },
      userEdits: {},
    });
    expect(merged.summary).toBe('ai-summary');
  });

  it('allows empty string user edit to override', () => {
    const merged = mergeResolvedOutputs({
      outputs: { text: 'ai' },
      userEdits: { text: '' },
    });
    expect(merged.text).toBe('');
  });

  it('last image wins when merging nodeOutputs with workflow order', () => {
    const merged = mergeResolvedOutputs(
      {
        outputs: { text: 't', image: 'legacy' },
        userEdits: {},
        nodeOutputs: {
          n1: { image: 'first.png' },
          n2: { image: 'second.png' },
        },
      },
      {
        workflowNodesOrdered: [
          { nodeId: 'n1', type: 'image_generation' },
          { nodeId: 'n2', type: 'image_generation' },
        ],
      },
    );
    expect(merged.image).toBe('second.png');
    expect(merged.text).toBe('t');
  });

  it('prefers pipelineNodesOrdered over workflow when both are set', () => {
    const merged = mergeResolvedOutputs(
      {
        outputs: { text: 'legacy-flat' },
        userEdits: {},
        nodeOutputs: {
          adapt__facebook: { text: 'FB from pipeline node' },
        },
      },
      {
        workflowNodesOrdered: [{ nodeId: 'adapt_tpl', type: 'adapt' }],
        pipelineNodesOrdered: [
          { nodeId: 'adapt__facebook', type: 'adapt', order: 1 },
        ],
      },
    );
    expect(merged.text).toBe('FB from pipeline node');
  });
});
