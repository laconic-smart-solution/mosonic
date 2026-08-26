import {
  resolveRerunWorkflowNodeId,
  stripMaterializedNodeSuffix,
} from './content-rerun-node-resolve.util';

describe('stripMaterializedNodeSuffix', () => {
  it('strips double-underscore lane suffix', () => {
    expect(
      stripMaterializedNodeSuffix('adapt__instagram', ['instagram']),
    ).toEqual({ baseId: 'adapt', lane: 'instagram' });
  });

  it('strips double-underscore lane suffix without known lanes list', () => {
    const nodeId = '45078cfe-20e0-41c8-b368-6d6eae22f469__facebook';
    expect(stripMaterializedNodeSuffix(nodeId, [])).toEqual({
      baseId: '45078cfe-20e0-41c8-b368-6d6eae22f469',
      lane: 'facebook',
    });
  });

  it('strips single-underscore lane suffix for uuid templates', () => {
    const nodeId = '8a8681d8-7b26-45fa-9e01-dffa7efa8abe_tiktok';
    expect(stripMaterializedNodeSuffix(nodeId, ['tiktok'])).toEqual({
      baseId: '8a8681d8-7b26-45fa-9e01-dffa7efa8abe',
      lane: 'tiktok',
    });
  });
});

describe('resolveRerunWorkflowNodeId', () => {
  const workflowNodes = [
    {
      nodeId: '8a8681d8-7b26-45fa-9e01-dffa7efa8abe',
      type: 'adapt',
      config: { laneId: 'tiktok' },
    },
    { nodeId: 'text', type: 'text_generation', config: {} },
  ];

  it('resolves materialized uuid lane node to workflow template id', () => {
    const materializedId = '8a8681d8-7b26-45fa-9e01-dffa7efa8abe_tiktok';
    expect(
      resolveRerunWorkflowNodeId(
        materializedId,
        workflowNodes,
        [{ nodeId: materializedId, type: 'adapt', lane: 'tiktok' }],
        ['tiktok'],
      ),
    ).toEqual({
      outputNodeId: materializedId,
      workflowNodeId: '8a8681d8-7b26-45fa-9e01-dffa7efa8abe',
    });
  });

  it('resolves double-underscore materialized ids', () => {
    const materializedId = 'adapt__instagram';
    expect(
      resolveRerunWorkflowNodeId(
        materializedId,
        [{ nodeId: 'adapt', type: 'adapt', config: {} }],
        [{ nodeId: materializedId, type: 'adapt', lane: 'instagram' }],
        ['instagram'],
      ),
    ).toEqual({
      outputNodeId: materializedId,
      workflowNodeId: 'adapt',
    });
  });

  it('returns direct match when workflow already uses the requested id', () => {
    expect(resolveRerunWorkflowNodeId('text', workflowNodes, [], [])).toEqual({
      outputNodeId: 'text',
      workflowNodeId: 'text',
    });
  });

  it('resolves uuid__facebook without graph lanes', () => {
    const uuid = '45078cfe-20e0-41c8-b368-6d6eae22f469';
    const materializedId = `${uuid}__facebook`;
    expect(
      resolveRerunWorkflowNodeId(
        materializedId,
        [{ nodeId: uuid, type: 'image_generation', config: {} }],
        [
          {
            nodeId: materializedId,
            type: 'image_generation',
            lane: 'facebook',
          },
        ],
        undefined,
      ),
    ).toEqual({
      outputNodeId: materializedId,
      workflowNodeId: uuid,
    });
  });

  it('falls back to sole workflow node of pipeline type', () => {
    const uuid = '45078cfe-20e0-41c8-b368-6d6eae22f469';
    const materializedId = `${uuid}__facebook`;
    expect(
      resolveRerunWorkflowNodeId(
        materializedId,
        [{ nodeId: 'other-image-id', type: 'image_generation', config: {} }],
        [{ nodeId: materializedId, type: 'image_generation' }],
        undefined,
      ),
    ).toEqual({
      outputNodeId: materializedId,
      workflowNodeId: 'other-image-id',
    });
  });
});
