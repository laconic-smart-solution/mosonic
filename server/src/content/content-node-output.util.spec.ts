import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  flattenNodeOutputsFromPipeline,
  flattenNodeOutputsToAiOutputs,
} from './content-node-output.util';

describe('flattenNodeOutputsFromPipeline', () => {
  it('last adapt lane overwrites text', () => {
    const out = flattenNodeOutputsFromPipeline(
      [
        { nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 1 },
        { nodeId: 'adapt__facebook', type: WorkflowNodeType.Adapt, order: 2 },
        { nodeId: 'adapt__instagram', type: WorkflowNodeType.Adapt, order: 3 },
      ],
      {
        text: { text: 'trunk copy' },
        adapt__facebook: { adaptedCaption: 'FB post' },
        adapt__instagram: { text: 'IG post' },
      },
    );
    expect(out.text).toBe('IG post');
  });

  it('uses adaptedCaption when text is empty', () => {
    const out = flattenNodeOutputsFromPipeline(
      [{ nodeId: 'adapt__x', type: WorkflowNodeType.Adapt, order: 1 }],
      { adapt__x: { adaptedCaption: 'caption only' } },
    );
    expect(out.text).toBe('caption only');
  });
});

describe('flattenNodeOutputsToAiOutputs adapt', () => {
  it('handles adapt nodes in workflow order', () => {
    const out = flattenNodeOutputsToAiOutputs(
      [{ nodeId: 'adapt_tpl', type: WorkflowNodeType.Adapt }],
      { adapt_tpl: { adaptedCaption: 'adapted' } },
    );
    expect(out.text).toBe('adapted');
  });
});
