import { ConfigService } from '@nestjs/config';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  GraphMaterializationService,
  mergeWorkflowLaneIntoConfig,
} from './graph-materialization.service';

describe('GraphMaterializationService', () => {
  const service = new GraphMaterializationService(
    { get: (_key: string, def?: unknown) => def } as ConfigService,
  );

  const rule = {
    channels: [
      { channel: 'instagram', priority: 'high', contentStyle: 'visual' },
      { channel: 'facebook', priority: 'medium', contentStyle: 'story' },
    ],
  } as never;

  it('passes through workflows without branch nodes', () => {
    const nodes = [
      {
        nodeId: 't1',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'i1',
        type: WorkflowNodeType.ImageGeneration,
        order: 2,
        isLocked: false,
        config: {},
      },
    ];
    const out = service.materialize(nodes, [], rule, 1);
    expect(out.lanes).toEqual([]);
    expect(out.nodes).toHaveLength(2);
    expect(out.edges).toHaveLength(1);
  });

  it('materializes wizard_channels branch using explicit channel list', () => {
    const sparseRule = {
      channels: [{ channel: 'linkedin', priority: 'low', contentStyle: 'short' }],
    } as never;

    const nodes = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'branch',
        type: WorkflowNodeType.Branch,
        order: 2,
        isLocked: false,
        config: {
          mode: 'wizard_channels',
          channels: ['instagram', 'facebook'],
        },
      },
      {
        nodeId: 'adapt',
        type: WorkflowNodeType.Adapt,
        order: 3,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 4,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'text', to: 'branch' },
      { from: 'branch', to: 'adapt' },
      { from: 'adapt', to: 'merge' },
    ];
    const out = service.materialize(nodes, edges, sparseRule, 1);
    expect(out.lanes.sort()).toEqual(['facebook', 'instagram']);
    expect(out.nodes.filter((n) => n.type === WorkflowNodeType.Adapt)).toHaveLength(
      2,
    );
  });

  it('materializes branch into per-channel adapt lanes', () => {
    const nodes = [
      {
        nodeId: 'kw',
        type: WorkflowNodeType.KeywordPlanner,
        order: 1,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 2,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'branch',
        type: WorkflowNodeType.Branch,
        order: 3,
        isLocked: false,
        config: { mode: 'rule_channels' },
      },
      {
        nodeId: 'adapt',
        type: WorkflowNodeType.Adapt,
        order: 4,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 5,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'kw', to: 'text' },
      { from: 'text', to: 'branch' },
      { from: 'branch', to: 'adapt' },
      { from: 'adapt', to: 'merge' },
    ];
    const out = service.materialize(nodes, edges, rule, 2);
    expect(out.lanes.sort()).toEqual(['facebook', 'instagram']);
    expect(out.nodes.some((n) => n.type === WorkflowNodeType.Branch)).toBe(
      false,
    );
    expect(out.nodes.filter((n) => n.type === WorkflowNodeType.Adapt)).toHaveLength(
      2,
    );
    expect(out.nodes.some((n) => n.type === WorkflowNodeType.Merge)).toBe(true);
    const instagramAdapt = out.nodes.find(
      (n) => n.lane === 'instagram' && n.type === WorkflowNodeType.Adapt,
    );
    expect(instagramAdapt?.config.channel).toBe('instagram');
  });

  it('materializes a single shared image template on every lane', () => {
    const nodes = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'branch',
        type: WorkflowNodeType.Branch,
        order: 2,
        isLocked: false,
        config: { mode: 'rule_channels' },
      },
      {
        nodeId: 'adapt',
        type: WorkflowNodeType.Adapt,
        order: 3,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'image',
        type: WorkflowNodeType.ImageGeneration,
        order: 4,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 5,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'text', to: 'branch' },
      { from: 'branch', to: 'adapt' },
      { from: 'adapt', to: 'image' },
      { from: 'image', to: 'merge' },
    ];
    const out = service.materialize(nodes, edges, rule, 2);
    const images = out.nodes.filter(
      (n) => n.type === WorkflowNodeType.ImageGeneration,
    );
    expect(images).toHaveLength(2);
    expect(images.map((n) => n.lane).sort()).toEqual(['facebook', 'instagram']);
    expect(images.some((n) => n.nodeId === 'image__instagram')).toBe(true);
    expect(images.some((n) => n.nodeId === 'image__facebook')).toBe(true);
  });

  it('materializes per-lane adapt templates when each has laneId', () => {
    const nodes = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'branch',
        type: WorkflowNodeType.Branch,
        order: 2,
        isLocked: false,
        config: { mode: 'rule_channels' },
      },
      {
        nodeId: 'adapt_ig',
        type: WorkflowNodeType.Adapt,
        order: 3,
        isLocked: false,
        config: { laneId: 'instagram', tone: 'casual' },
      },
      {
        nodeId: 'adapt_fb',
        type: WorkflowNodeType.Adapt,
        order: 4,
        isLocked: false,
        config: { laneId: 'facebook', tone: 'formal' },
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 5,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'text', to: 'branch' },
      { from: 'branch', to: 'adapt_ig' },
      { from: 'branch', to: 'adapt_fb' },
      { from: 'adapt_ig', to: 'merge' },
      { from: 'adapt_fb', to: 'merge' },
    ];
    const out = service.materialize(nodes, edges, rule, 2);
    const igAdapt = out.nodes.find(
      (n) => n.lane === 'instagram' && n.type === WorkflowNodeType.Adapt,
    );
    const fbAdapt = out.nodes.find(
      (n) => n.lane === 'facebook' && n.type === WorkflowNodeType.Adapt,
    );
    expect(igAdapt?.config.tone).toBe('casual');
    expect(fbAdapt?.config.tone).toBe('formal');
    expect(igAdapt?.nodeId).not.toBe(fbAdapt?.nodeId);
  });

  it('materializes A/B variants with variantId on lane nodes', () => {
    const nodes = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'branch',
        type: WorkflowNodeType.Branch,
        order: 2,
        isLocked: false,
        config: {
          mode: 'ab_test',
          variants: [
            { id: 'variant_a', weight: 50, channel: 'instagram' },
            { id: 'variant_b', weight: 50, channel: 'facebook' },
          ],
        },
      },
      {
        nodeId: 'adapt',
        type: WorkflowNodeType.Adapt,
        order: 3,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 4,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'text', to: 'branch' },
      { from: 'branch', to: 'adapt' },
      { from: 'adapt', to: 'merge' },
    ];
    const out = service.materialize(nodes, edges, rule, 3);
    const variantIds = new Set(
      out.nodes.map((n) => n.variantId).filter((v): v is string => !!v),
    );
    expect(variantIds.has('variant_a')).toBe(true);
    expect(variantIds.has('variant_b')).toBe(true);
  });

  it('materializes translation only on the lane matching laneId', () => {
    const nodes = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'branch',
        type: WorkflowNodeType.Branch,
        order: 2,
        isLocked: false,
        config: { mode: 'rule_channels' },
      },
      {
        nodeId: 'trans_li',
        type: WorkflowNodeType.Translation,
        order: 3,
        isLocked: false,
        config: { laneId: 'instagram', targetLanguage: 'zh' },
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 4,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'text', to: 'branch' },
      { from: 'branch', to: 'trans_li' },
      { from: 'trans_li', to: 'merge' },
    ];
    const out = service.materialize(nodes, edges, rule, 2);
    const translations = out.nodes.filter(
      (n) => n.type === WorkflowNodeType.Translation,
    );
    expect(translations).toHaveLength(1);
    expect(translations[0]?.lane).toBe('instagram');
    expect(translations[0]?.nodeId).toBe('trans_li__instagram');
    expect(
      out.nodes.filter(
        (n) => n.type === WorkflowNodeType.Adapt && n.lane === 'instagram',
      ),
    ).toHaveLength(0);
    expect(
      out.nodes.filter(
        (n) => n.type === WorkflowNodeType.Adapt && n.lane === 'facebook',
      ),
    ).toHaveLength(1);
  });

  it('materializes a singleton summarization template on every lane', () => {
    const nodes = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'branch',
        type: WorkflowNodeType.Branch,
        order: 2,
        isLocked: false,
        config: { mode: 'rule_channels' },
      },
      {
        nodeId: 'sum',
        type: WorkflowNodeType.Summarization,
        order: 3,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 4,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'text', to: 'branch' },
      { from: 'branch', to: 'sum' },
      { from: 'sum', to: 'merge' },
    ];
    const out = service.materialize(nodes, edges, rule, 2);
    const summaries = out.nodes.filter(
      (n) => n.type === WorkflowNodeType.Summarization,
    );
    expect(summaries).toHaveLength(2);
    expect(summaries.map((n) => n.lane).sort()).toEqual([
      'facebook',
      'instagram',
    ]);
    expect(out.nodes.filter((n) => n.type === WorkflowNodeType.Adapt)).toHaveLength(
      0,
    );
  });

  it('does not materialize summarization when multiple unassigned templates exist', () => {
    const nodes = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'branch',
        type: WorkflowNodeType.Branch,
        order: 2,
        isLocked: false,
        config: { mode: 'rule_channels' },
      },
      {
        nodeId: 'sum_a',
        type: WorkflowNodeType.Summarization,
        order: 3,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'sum_b',
        type: WorkflowNodeType.Summarization,
        order: 4,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 5,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'text', to: 'branch' },
      { from: 'branch', to: 'sum_a' },
      { from: 'sum_a', to: 'sum_b' },
      { from: 'sum_b', to: 'merge' },
    ];
    const out = service.materialize(nodes, edges, rule, 2);
    expect(
      out.nodes.filter((n) => n.type === WorkflowNodeType.Summarization),
    ).toHaveLength(0);
  });

  it('materializes distinct lane nodes only on their lanes', () => {
    const nodes = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'branch',
        type: WorkflowNodeType.Branch,
        order: 2,
        isLocked: false,
        config: { mode: 'rule_channels' },
      },
      {
        nodeId: 'sum_ig',
        type: WorkflowNodeType.Summarization,
        order: 3,
        isLocked: false,
        config: { laneId: 'instagram' },
      },
      {
        nodeId: 'trans_fb',
        type: WorkflowNodeType.Translation,
        order: 4,
        isLocked: false,
        config: { laneId: 'facebook', targetLanguage: 'zh' },
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 5,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'text', to: 'branch' },
      { from: 'branch', to: 'sum_ig' },
      { from: 'branch', to: 'trans_fb' },
      { from: 'sum_ig', to: 'merge' },
      { from: 'trans_fb', to: 'merge' },
    ];
    const out = service.materialize(nodes, edges, rule, 2);
    expect(
      out.nodes.some(
        (n) =>
          n.type === WorkflowNodeType.Summarization && n.lane === 'instagram',
      ),
    ).toBe(true);
    expect(
      out.nodes.some(
        (n) =>
          n.type === WorkflowNodeType.Summarization && n.lane === 'facebook',
      ),
    ).toBe(false);
    expect(
      out.nodes.some(
        (n) => n.type === WorkflowNodeType.Translation && n.lane === 'facebook',
      ),
    ).toBe(true);
    expect(
      out.nodes.some(
        (n) => n.type === WorkflowNodeType.Translation && n.lane === 'instagram',
      ),
    ).toBe(false);
  });

  it('excludes deprecated Twitter / X channels from rule_channels materialization', () => {
    const ruleFour = {
      channels: [
        { channel: 'Instagram', priority: 'high', contentStyle: 'visual' },
        { channel: 'Facebook', priority: 'medium', contentStyle: 'story' },
        { channel: 'LinkedIn', priority: 'medium', contentStyle: 'professional' },
        { channel: 'Twitter / X', priority: 'medium', contentStyle: 'short' },
      ],
    } as never;
    const nodes = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'branch',
        type: WorkflowNodeType.Branch,
        order: 2,
        isLocked: false,
        config: { mode: 'rule_channels' },
      },
      {
        nodeId: 'adapt_tw',
        type: WorkflowNodeType.Adapt,
        order: 3,
        isLocked: false,
        config: { laneId: 'twitter' },
      },
      {
        nodeId: 'sum_tw',
        type: WorkflowNodeType.Summarization,
        order: 4,
        isLocked: false,
        config: { laneId: 'twitter' },
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 5,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'text', to: 'branch' },
      { from: 'branch', to: 'adapt_tw' },
      { from: 'adapt_tw', to: 'sum_tw' },
      { from: 'sum_tw', to: 'merge' },
    ];
    const out = service.materialize(nodes, edges, ruleFour, 2);
    expect(out.lanes).not.toContain('twitter');
    expect(out.nodes.every((n) => n.lane !== 'twitter')).toBe(true);
    expect(out.nodes.some((n) => n.nodeId.includes('twitter'))).toBe(false);
  });

  it('mergeWorkflowLaneIntoConfig adds laneId when missing', () => {
    expect(mergeWorkflowLaneIntoConfig({}, 'linkedin')).toEqual({
      laneId: 'linkedin',
    });
    expect(
      mergeWorkflowLaneIntoConfig({ laneId: 'instagram' }, 'linkedin'),
    ).toEqual({ laneId: 'instagram' });
  });

  it('materializes adapt then translation on single LinkedIn lane', () => {
    const ruleOne = {
      channels: [{ channel: 'linkedin', priority: 'high', contentStyle: 'x' }],
    } as never;
    const nodes = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'branch',
        type: WorkflowNodeType.Branch,
        order: 2,
        isLocked: false,
        config: { mode: 'rule_channels' },
      },
      {
        nodeId: 'adapt_li',
        type: WorkflowNodeType.Adapt,
        order: 3,
        isLocked: false,
        config: { laneId: 'linkedin' },
      },
      {
        nodeId: 'trans_li',
        type: WorkflowNodeType.Translation,
        order: 4,
        isLocked: false,
        config: { laneId: 'linkedin', targetLanguage: 'es' },
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 5,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'text', to: 'branch' },
      { from: 'branch', to: 'adapt_li' },
      { from: 'adapt_li', to: 'trans_li' },
      { from: 'trans_li', to: 'merge' },
    ];
    const out = service.materialize(nodes, edges, ruleOne, 2);
    const trans = out.nodes.find(
      (n) => n.type === WorkflowNodeType.Translation && n.lane === 'linkedin',
    );
    expect(trans).toBeDefined();
    expect(trans?.nodeId).toBe('trans_li__linkedin');
    expect(
      out.edges.some(
        (e) => e.from === 'adapt_li__linkedin' && e.to === 'trans_li__linkedin',
      ),
    ).toBe(true);
  });
});
