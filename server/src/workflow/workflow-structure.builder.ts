import { randomUUID } from 'node:crypto';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { WorkflowQAAnswersDto } from './dto/workflow-qa-answers.dto';
import { resolveQaNodeChannels } from './workflow-qa-channels.constants';

export type LogicalWorkflowNode = {
  nodeId: string;
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  targetChannels: string[];
  config: Record<string, unknown>;
  userPrompt: string;
};

export type GeneratedWorkflowNode = {
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  config: Record<string, unknown>;
  userPrompt?: string;
  lane?: string | null;
};

export function buildWorkflowNodes(
  answers: WorkflowQAAnswersDto,
  ruleChannelIds: string[],
): LogicalWorkflowNode[] {
  const channels = [...ruleChannelIds];
  const nodes: LogicalWorkflowNode[] = [];
  let order = 1;

  if (!channels.length) {
    return nodes;
  }

  if (answers.useKeywordPlanner) {
    nodes.push({
      nodeId: randomUUID(),
      type: WorkflowNodeType.KeywordPlanner,
      order: order++,
      isLocked: false,
      targetChannels: [...channels],
      config: {},
      userPrompt: '',
    });
  }

  if (answers.useWebSearch) {
    nodes.push({
      nodeId: randomUUID(),
      type: WorkflowNodeType.Intelligence,
      order: order++,
      isLocked: false,
      targetChannels: [...channels],
      config: { searchType: 'all' },
      userPrompt: '',
    });
  }

  nodes.push({
    nodeId: randomUUID(),
    type: WorkflowNodeType.TextGeneration,
    order: order++,
    isLocked: true,
    targetChannels: [...channels],
    config: {},
    userPrompt: '',
  });

  if (answers.generateSummary) {
    const summaryChannels = resolveQaNodeChannels(
      answers.summaryChannels,
      channels,
    );
    if (summaryChannels.length) {
      nodes.push({
        nodeId: randomUUID(),
        type: WorkflowNodeType.Summarization,
        order: order++,
        isLocked: false,
        targetChannels: summaryChannels,
        config: { sourceNodeRef: 'text_generation' },
        userPrompt: '',
      });
    }
  }

  if (answers.translate) {
    const translationChannels = resolveQaNodeChannels(
      answers.translationChannels,
      channels,
    );
    const languages = (answers.targetLanguages ?? [])
      .map((l) => l.trim())
      .filter(Boolean);
    for (const lang of languages) {
      nodes.push({
        nodeId: randomUUID(),
        type: WorkflowNodeType.Translation,
        order: order++,
        isLocked: false,
        targetChannels: translationChannels,
        config: { targetLanguage: lang },
        userPrompt: '',
      });
    }
  }

  if (answers.generateImage) {
    const imageChannels = resolveQaNodeChannels(
      answers.imageChannels,
      channels,
    );
    if (imageChannels.length) {
      nodes.push({
        nodeId: randomUUID(),
        type: WorkflowNodeType.ImageGeneration,
        order: order++,
        isLocked: false,
        targetChannels: imageChannels,
        config: {},
        userPrompt: '',
      });
    }
  }

  if (answers.generateVideo) {
    const videoChannels = resolveQaNodeChannels(
      answers.videoChannels,
      channels,
    );
    if (videoChannels.length) {
      nodes.push({
        nodeId: randomUUID(),
        type: WorkflowNodeType.VideoGeneration,
        order: order++,
        isLocked: false,
        targetChannels: videoChannels,
        config: {},
        userPrompt: '',
      });
    }
  }

  return nodes;
}

function findLogical(
  logical: LogicalWorkflowNode[],
  type: WorkflowNodeType,
  opts?: { targetLanguage?: string },
): LogicalWorkflowNode | undefined {
  if (type === WorkflowNodeType.Translation && opts?.targetLanguage) {
    return logical.find(
      (n) =>
        n.type === type &&
        String(n.config.targetLanguage ?? '') === opts.targetLanguage,
    );
  }
  return logical.find((n) => n.type === type);
}

function copyFromLogical(
  logical: LogicalWorkflowNode | undefined,
  config: Record<string, unknown>,
): Pick<GeneratedWorkflowNode, 'config' | 'userPrompt'> {
  if (!logical) {
    return { config, userPrompt: '' };
  }
  return {
    config: { ...logical.config, ...config },
    userPrompt: logical.userPrompt ?? '',
  };
}

function toGenerated(
  type: WorkflowNodeType,
  order: number,
  isLocked: boolean,
  config: Record<string, unknown>,
  userPrompt: string,
  lane?: string | null,
): GeneratedWorkflowNode {
  return {
    type,
    order,
    isLocked,
    config,
    userPrompt,
    lane: lane ?? null,
  };
}

export function toPersistableGraph(
  logicalNodes: LogicalWorkflowNode[],
  ruleChannelIds: string[],
): GeneratedWorkflowNode[] {
  const channels = [...ruleChannelIds];
  if (channels.length === 0) {
    return [];
  }

  if (channels.length === 1) {
    return toLinearGraph(logicalNodes, channels[0]);
  }

  return toMultiChannelGraph(logicalNodes, channels);
}

function toLinearGraph(
  logical: LogicalWorkflowNode[],
  channel: string,
): GeneratedWorkflowNode[] {
  const nodes: GeneratedWorkflowNode[] = [];
  let order = 1;

  const keyword = findLogical(logical, WorkflowNodeType.KeywordPlanner);
  if (keyword) {
    const copied = copyFromLogical(keyword, {});
    nodes.push(
      toGenerated(
        WorkflowNodeType.KeywordPlanner,
        order++,
        false,
        copied.config,
        copied.userPrompt ?? '',
      ),
    );
  }

  const intel = findLogical(logical, WorkflowNodeType.Intelligence);
  if (intel) {
    const copied = copyFromLogical(intel, {});
    nodes.push(
      toGenerated(
        WorkflowNodeType.Intelligence,
        order++,
        false,
        copied.config,
        copied.userPrompt ?? '',
      ),
    );
  }

  const text = findLogical(logical, WorkflowNodeType.TextGeneration)!;
  const textCopied = copyFromLogical(text, {});
  nodes.push(
    toGenerated(
      WorkflowNodeType.TextGeneration,
      order++,
      true,
      textCopied.config,
      textCopied.userPrompt ?? '',
    ),
  );

  const summary = findLogical(logical, WorkflowNodeType.Summarization);
  if (summary && summary.targetChannels.includes(channel)) {
    const copied = copyFromLogical(summary, {
      sourceNodeRef: summary.config.sourceNodeRef ?? 'text_generation',
    });
    nodes.push(
      toGenerated(
        WorkflowNodeType.Summarization,
        order++,
        false,
        copied.config,
        copied.userPrompt ?? '',
      ),
    );
  }

  const translations = logical.filter(
    (n) =>
      n.type === WorkflowNodeType.Translation &&
      n.targetChannels.includes(channel),
  );
  for (const tr of translations) {
    const copied = copyFromLogical(tr, {
      targetLanguage: tr.config.targetLanguage,
    });
    nodes.push(
      toGenerated(
        WorkflowNodeType.Translation,
        order++,
        false,
        copied.config,
        copied.userPrompt ?? '',
      ),
    );
  }

  const image = findLogical(logical, WorkflowNodeType.ImageGeneration);
  if (image && image.targetChannels.includes(channel)) {
    const copied = copyFromLogical(image, {});
    nodes.push(
      toGenerated(
        WorkflowNodeType.ImageGeneration,
        order++,
        false,
        copied.config,
        copied.userPrompt ?? '',
      ),
    );
  }

  const video = findLogical(logical, WorkflowNodeType.VideoGeneration);
  if (video && video.targetChannels.includes(channel)) {
    const copied = copyFromLogical(video, {});
    nodes.push(
      toGenerated(
        WorkflowNodeType.VideoGeneration,
        order++,
        false,
        copied.config,
        copied.userPrompt ?? '',
      ),
    );
  }

  return nodes;
}

function toMultiChannelGraph(
  logical: LogicalWorkflowNode[],
  channels: string[],
): GeneratedWorkflowNode[] {
  const nodes: GeneratedWorkflowNode[] = [];
  let order = 1;

  const keyword = findLogical(logical, WorkflowNodeType.KeywordPlanner);
  if (keyword) {
    const copied = copyFromLogical(keyword, {});
    nodes.push(
      toGenerated(
        WorkflowNodeType.KeywordPlanner,
        order++,
        false,
        copied.config,
        copied.userPrompt ?? '',
      ),
    );
  }

  const intel = findLogical(logical, WorkflowNodeType.Intelligence);
  if (intel) {
    const copied = copyFromLogical(intel, {});
    nodes.push(
      toGenerated(
        WorkflowNodeType.Intelligence,
        order++,
        false,
        copied.config,
        copied.userPrompt ?? '',
      ),
    );
  }

  const text = findLogical(logical, WorkflowNodeType.TextGeneration)!;
  const textCopied = copyFromLogical(text, {});
  nodes.push(
    toGenerated(
      WorkflowNodeType.TextGeneration,
      order++,
      true,
      textCopied.config,
      textCopied.userPrompt ?? '',
    ),
  );

  nodes.push(
    toGenerated(
      WorkflowNodeType.Branch,
      order++,
      false,
      { mode: 'rule_channels' },
      '',
    ),
  );

  const adaptLogical = findLogical(logical, WorkflowNodeType.Adapt);
  const adaptCopied = copyFromLogical(adaptLogical, {});
  nodes.push(
    toGenerated(
      WorkflowNodeType.Adapt,
      order++,
      false,
      adaptCopied.config,
      adaptCopied.userPrompt ?? '',
    ),
  );

  const summaryLogical = findLogical(logical, WorkflowNodeType.Summarization);
  if (summaryLogical) {
    for (const ch of summaryLogical.targetChannels) {
      if (!channels.includes(ch)) continue;
      const copied = copyFromLogical(summaryLogical, {
        laneId: ch,
        sourceNodeRef: summaryLogical.config.sourceNodeRef ?? 'text_generation',
      });
      nodes.push(
        toGenerated(
          WorkflowNodeType.Summarization,
          order++,
          false,
          copied.config,
          copied.userPrompt ?? '',
          ch,
        ),
      );
    }
  }

  const translationLogicals = logical.filter(
    (n) => n.type === WorkflowNodeType.Translation,
  );

  for (const ch of channels) {
    for (const tr of translationLogicals) {
      if (!tr.targetChannels.includes(ch)) continue;
      const lang = String(tr.config.targetLanguage ?? '').trim();
      if (!lang) continue;
      const copied = copyFromLogical(tr, { laneId: ch, targetLanguage: lang });
      nodes.push(
        toGenerated(
          WorkflowNodeType.Translation,
          order++,
          false,
          copied.config,
          copied.userPrompt ?? '',
          ch,
        ),
      );
    }
  }

  const imageLogical = findLogical(logical, WorkflowNodeType.ImageGeneration);
  for (const ch of imageLogical?.targetChannels ?? []) {
    if (!channels.includes(ch)) continue;
    const copied = copyFromLogical(imageLogical, { laneId: ch });
    nodes.push(
      toGenerated(
        WorkflowNodeType.ImageGeneration,
        order++,
        false,
        copied.config,
        copied.userPrompt ?? '',
        ch,
      ),
    );
  }

  const videoLogical = findLogical(logical, WorkflowNodeType.VideoGeneration);
  for (const ch of videoLogical?.targetChannels ?? []) {
    if (!channels.includes(ch)) continue;
    const copied = copyFromLogical(videoLogical, { laneId: ch });
    nodes.push(
      toGenerated(
        WorkflowNodeType.VideoGeneration,
        order++,
        false,
        copied.config,
        copied.userPrompt ?? '',
        ch,
      ),
    );
  }

  nodes.push(toGenerated(WorkflowNodeType.Merge, order++, false, {}, ''));

  return nodes;
}
