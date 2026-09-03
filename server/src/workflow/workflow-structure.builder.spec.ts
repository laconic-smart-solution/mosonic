import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { WorkflowQAAnswersDto } from './dto/workflow-qa-answers.dto';
import {
  assignNodeIds,
  expandGraphLaneTemplates,
} from './workflow-graph-expand.util';
import {
  buildWorkflowNodes,
  toPersistableGraph,
} from './workflow-structure.builder';

const RULE_CHANNELS = ['instagram', 'facebook', 'linkedin'];

function baseAnswers(
  overrides: Partial<WorkflowQAAnswersDto> = {},
): WorkflowQAAnswersDto {
  return {
    useWebSearch: false,
    useKeywordPlanner: false,
    generateSummary: false,
    summaryChannels: [],
    generateImage: false,
    imageChannels: [],
    generateVideo: false,
    videoChannels: [],
    translate: false,
    translationChannels: [],
    targetLanguages: [],
    additionalMessage: 'Black Friday sale post',
    ...overrides,
  };
}

describe('buildWorkflowNodes', () => {
  it('always emits locked text_generation first when no web search', () => {
    const nodes = buildWorkflowNodes(baseAnswers(), ['instagram']);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: WorkflowNodeType.TextGeneration,
      isLocked: true,
      targetChannels: ['instagram'],
    });
  });

  it('prepends intelligence when useWebSearch is true', () => {
    const nodes = buildWorkflowNodes(baseAnswers({ useWebSearch: true }), [
      'instagram',
    ]);
    expect(nodes.map((n) => n.type)).toEqual([
      WorkflowNodeType.Intelligence,
      WorkflowNodeType.TextGeneration,
    ]);
  });

  it('prepends keyword_planner before intelligence and text when both enabled', () => {
    const nodes = buildWorkflowNodes(
      baseAnswers({ useKeywordPlanner: true, useWebSearch: true }),
      ['instagram'],
    );
    expect(nodes.map((n) => n.type)).toEqual([
      WorkflowNodeType.KeywordPlanner,
      WorkflowNodeType.Intelligence,
      WorkflowNodeType.TextGeneration,
    ]);
  });

  it('prepends keyword_planner before text when enabled alone', () => {
    const nodes = buildWorkflowNodes(baseAnswers({ useKeywordPlanner: true }), [
      'instagram',
    ]);
    expect(nodes.map((n) => n.type)).toEqual([
      WorkflowNodeType.KeywordPlanner,
      WorkflowNodeType.TextGeneration,
    ]);
  });

  it('scopes image to selected rule channels when enabled', () => {
    const nodes = buildWorkflowNodes(
      baseAnswers({
        generateImage: true,
        imageChannels: ['instagram', 'facebook'],
      }),
      RULE_CHANNELS,
    );
    expect(nodes.map((n) => n.type)).toEqual([
      WorkflowNodeType.TextGeneration,
      WorkflowNodeType.ImageGeneration,
    ]);
    expect(nodes[1].targetChannels).toEqual(['instagram', 'facebook']);
  });

  it('adds summarization for selected channels after text', () => {
    const nodes = buildWorkflowNodes(
      baseAnswers({
        generateSummary: true,
        summaryChannels: ['instagram'],
      }),
      RULE_CHANNELS,
    );
    expect(nodes.map((n) => n.type)).toEqual([
      WorkflowNodeType.TextGeneration,
      WorkflowNodeType.Summarization,
    ]);
    expect(nodes[1].config).toMatchObject({
      sourceNodeRef: 'text_generation',
    });
  });

  it('auto-applies sole rule channel when image channels omitted', () => {
    const nodes = buildWorkflowNodes(baseAnswers({ generateImage: true }), [
      'instagram',
    ]);
    expect(nodes[1].targetChannels).toEqual(['instagram']);
  });

  it('returns empty when rule has no channels', () => {
    const nodes = buildWorkflowNodes(baseAnswers(), []);
    expect(nodes).toHaveLength(0);
  });

  it('emits one translation node per target language', () => {
    const nodes = buildWorkflowNodes(
      baseAnswers({
        translate: true,
        translationChannels: ['instagram'],
        targetLanguages: ['th', 'en'],
      }),
      ['instagram'],
    );
    const translations = nodes.filter(
      (n) => n.type === WorkflowNodeType.Translation,
    );
    expect(translations).toHaveLength(2);
    expect(translations.map((n) => n.config.targetLanguage)).toEqual([
      'th',
      'en',
    ]);
  });
});

describe('toPersistableGraph', () => {
  it('produces linear graph for single channel', () => {
    const answers = baseAnswers({
      useKeywordPlanner: true,
      useWebSearch: true,
      generateImage: true,
      imageChannels: ['instagram'],
    });
    const logical = buildWorkflowNodes(answers, ['instagram']);
    const graph = toPersistableGraph(logical, ['instagram']);
    expect(graph.map((n) => n.type)).toEqual([
      WorkflowNodeType.KeywordPlanner,
      WorkflowNodeType.Intelligence,
      WorkflowNodeType.TextGeneration,
      WorkflowNodeType.ImageGeneration,
    ]);
    expect(graph.some((n) => n.type === WorkflowNodeType.Branch)).toBe(false);
  });

  it('produces branch graph for multi-channel rule with per-lane media', () => {
    const answers = baseAnswers({
      generateSummary: true,
      summaryChannels: ['instagram', 'facebook'],
      generateImage: true,
      imageChannels: ['instagram', 'facebook'],
      translate: true,
      translationChannels: ['instagram', 'facebook', 'linkedin'],
      targetLanguages: ['th', 'en'],
    });
    const logical = buildWorkflowNodes(answers, RULE_CHANNELS);
    const graph = toPersistableGraph(logical, RULE_CHANNELS);

    const branch = graph.find((n) => n.type === WorkflowNodeType.Branch);
    expect(branch?.config).toMatchObject({ mode: 'rule_channels' });

    const summaries = graph.filter(
      (n) => n.type === WorkflowNodeType.Summarization,
    );
    expect(summaries).toHaveLength(2);

    const images = graph.filter(
      (n) => n.type === WorkflowNodeType.ImageGeneration,
    );
    expect(images).toHaveLength(2);
    expect(images.map((n) => n.lane).sort()).toEqual(['facebook', 'instagram']);

    const translations = graph.filter(
      (n) => n.type === WorkflowNodeType.Translation,
    );
    expect(translations).toHaveLength(6);
  });

  it('Default preset: keyword → intelligence → text → branch → adapt → merge (multi-channel)', () => {
    const answers = baseAnswers({
      useKeywordPlanner: true,
      useWebSearch: true,
    });
    const logical = buildWorkflowNodes(answers, RULE_CHANNELS);
    const graph = toPersistableGraph(logical, RULE_CHANNELS);
    expect(graph.map((n) => n.type)).toEqual([
      WorkflowNodeType.KeywordPlanner,
      WorkflowNodeType.Intelligence,
      WorkflowNodeType.TextGeneration,
      WorkflowNodeType.Branch,
      WorkflowNodeType.Adapt,
      WorkflowNodeType.Merge,
    ]);

    const expanded = expandGraphLaneTemplates(
      assignNodeIds(graph),
      RULE_CHANNELS,
    );
    expect(expanded.map((n) => n.type)).toEqual([
      WorkflowNodeType.KeywordPlanner,
      WorkflowNodeType.Intelligence,
      WorkflowNodeType.TextGeneration,
      WorkflowNodeType.Branch,
      WorkflowNodeType.Adapt,
      WorkflowNodeType.Adapt,
      WorkflowNodeType.Adapt,
      WorkflowNodeType.Merge,
    ]);
    expect(
      expanded
        .filter((n) => n.type === WorkflowNodeType.Adapt)
        .map((n) => n.lane)
        .sort(),
    ).toEqual([...RULE_CHANNELS].sort());
  });
});
