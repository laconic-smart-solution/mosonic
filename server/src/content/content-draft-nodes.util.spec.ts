import {
  applyNodeOutputToDraft,
  buildDraftNodeCatalog,
  copyNodeOutputIntoEdits,
  resolveDraftNodeTarget,
} from './content-draft-nodes.util';

describe('content-draft-nodes.util', () => {
  it('lists pipeline images including a generate-more node', () => {
    const catalog = buildDraftNodeCatalog({
      workflowNodes: [
        { nodeId: 'img', type: 'image_generation', order: 2, lane: 'facebook' },
        {
          nodeId: 'extra',
          type: 'image_generation',
          order: 5,
          isGenerateMoreOnly: true,
        },
      ],
      pipelineNodes: [
        {
          nodeId: 'img__facebook',
          type: 'image_generation',
          order: 2,
          lane: 'facebook',
        },
      ],
      nodeOutputs: {
        img__facebook: { image: 'https://cdn/fb.png' },
        extra: { image: 'https://cdn/extra.png' },
      },
    });
    expect(catalog.nodes.map((node) => node.nodeId)).toEqual([
      'img__facebook',
      'extra',
    ]);
    expect(resolveDraftNodeTarget('image', catalog.nodes).kind).toBe('ask');
  });

  it('resolves a single text node and asks when channels differ', () => {
    const nodes = [
      {
        nodeId: 'adapt-fb',
        type: 'adapt',
        lane: 'facebook',
        field: 'text',
        preview: 'FB',
        pending: false,
      },
      {
        nodeId: 'adapt-li',
        type: 'adapt',
        lane: 'linkedin',
        field: 'text',
        preview: 'LI',
        pending: false,
      },
    ];
    const asked = resolveDraftNodeTarget('text', nodes);
    expect(asked.kind).toBe('ask');
    if (asked.kind === 'ask') {
      expect(asked.options.map((option) => option.id)).toContain('all');
    }
    expect(resolveDraftNodeTarget('all', nodes).kind).toBe('many');
  });

  it('copies a node result onto both edit layers and drops pending', () => {
    const copied = copyNodeOutputIntoEdits({
      nodeId: 'n1',
      output: { text: 'Shorter' },
      userEdits: { text: 'Old' },
      nodeUserEdits: { n1: { text: 'Old', _pending: true } },
    });
    expect(copied.userEdits.text).toBe('Shorter');
    expect(copied.nodeUserEdits.n1).toEqual({ text: 'Shorter' });
  });

  it('copies a channel node onto that lane and the materialized output key', () => {
    const copied = applyNodeOutputToDraft({
      nodeId: 'adapt__facebook',
      output: { text: 'Shorter FB', adaptedCaption: 'Shorter FB', channel: 'facebook' },
      userEdits: { text: 'Old' },
      nodeUserEdits: {},
      nodeOutputs: { adapt__facebook: { text: 'Old', _pending: true } },
      laneOutputs: { facebook: { text: 'Old' }, linkedin: { text: 'LI' } },
      lane: 'facebook',
      aliasNodeIds: ['adapt-uuid'],
    });
    expect(copied.nodeOutputs.adapt__facebook.text).toBe('Shorter FB');
    expect(copied.nodeOutputs['adapt-uuid'].text).toBe('Shorter FB');
    expect(copied.nodeUserEdits.adapt__facebook.text).toBe('Shorter FB');
    expect(copied.laneOutputs.facebook.text).toBe('Shorter FB');
    expect(copied.laneOutputs.linkedin.text).toBe('LI');
  });
});