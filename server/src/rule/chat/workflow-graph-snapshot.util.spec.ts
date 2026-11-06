import {
  buildWorkflowGraphSnapshot,
  renderWorkflowGraphSnapshot,
  willChangeLinesToTools,
} from './workflow-graph-snapshot.util';

describe('workflow graph snapshot', () => {
  const nodes = [
    { type: 'text_generation' },
    { type: 'adapt', lane: 'facebook' },
    { type: 'image_generation', lane: 'facebook' },
  ];

  it('counts image_generation per lane', () => {
    const snap = buildWorkflowGraphSnapshot(nodes, 'ready');
    expect(snap.hasWorkflow).toBe(true);
    expect(snap.lanes.find((l) => l.lane === 'facebook')?.imageGeneration).toBe(1);
    expect(snap.totalImageGeneration).toBe(1);
  });

  it('N image nodes => N per-run images on that lane', () => {
    const four = [
      ...nodes,
      { type: 'image_generation', lane: 'facebook', nodeId: 'i2' },
      { type: 'image_generation', lane: 'facebook', nodeId: 'i3' },
      { type: 'image_generation', lane: 'facebook', nodeId: 'i4' },
    ];
    const snap = buildWorkflowGraphSnapshot(four);
    expect(snap.lanes.find((l) => l.lane === 'facebook')?.imageGeneration).toBe(4);
    const text = renderWorkflowGraphSnapshot(snap);
    expect(text).toMatch(/image_generation=4/);
    expect(text).toMatch(/4 image\(s\) per run/);
    expect(text).toMatch(/willChange, not impossible/);
  });

  it('no workflow is explicit', () => {
    const text = renderWorkflowGraphSnapshot(buildWorkflowGraphSnapshot(null));
    expect(text).toMatch(/Workflow: none yet/);
  });

  it('maps willChange lines to tools', () => {
    expect(
      willChangeLinesToTools([
        'Add 4 image steps so one run produces 4 images (each step = 1 image)',
        'Post only to Facebook',
      ]),
    ).toEqual(['add_workflow_node', 'set_workflow_channels', 'start_generation']);
  });
});
