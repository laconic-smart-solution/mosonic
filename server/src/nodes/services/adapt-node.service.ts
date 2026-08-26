import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import type { ChannelEntry } from '../../rule/schemas/rule.schema';
import { normalizedRuleChannelMapping } from '../../rule/rule-mapping.util';
import { CaptionMappingSource } from '../../rule/schemas/rule.schema';
import type { WorkflowNodeConfig } from '../schemas/workflow-node.schema';
import {
  adaptChannelHumanReminder,
  adaptChannelPromptGuardrails,
  enforceAdaptChannelLimits,
} from './adapt-channel-guardrails.util';
import { sanitizeGeneratedPostText } from './generated-text-guardrails.util';
import { formatGenerationTemporalContext } from './generation-temporal-context.util';
import type {
  NodeExecutionInput,
  NodeExecutionResult,
  PreviousOutputs,
} from '../types/node-execution.types';
import { extractUsageFromAiMessage } from '../langchain-usage.util';

type AdaptConfig = {
  channel?: string;
  contentStyle?: string;
};

@Injectable()
export class AdaptNodeService {
  constructor(private readonly llm: LlmService) {}

  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    const rule = input.rule;
    if (!rule) {
      throw new UnprocessableEntityException(
        'adapt node requires rule on execution input',
      );
    }
    const config = (input.config ?? {}) as AdaptConfig & WorkflowNodeConfig;
    const channelKey = config.channel?.trim();
    if (!channelKey) {
      throw new UnprocessableEntityException(
        'adapt node is missing channel configuration',
      );
    }

    const channelEntry =
      rule.channels?.find(
        (c) => c.channel.trim().toLowerCase() === channelKey.toLowerCase(),
      ) ??
      ({
        channel: channelKey,
        priority: 'medium',
        contentStyle: config.contentStyle ?? '',
      } as ChannelEntry);

    const mapping = normalizedRuleChannelMapping(channelEntry);
    const previous = input.previousOutputs ?? {};
    const baseText =
      previous.translatedText?.trim() ||
      previous.text?.trim() ||
      previous.summary?.trim() ||
      '';

    const model = this.llm.getChatModelForPlainText({
      provider: config.provider,
      model: typeof config.model === 'string' ? config.model : 'gpt-4o',
    });

    const system = [
      'You adapt marketing copy for a specific social channel.',
      'Preserve brand voice and factual content; change format and length for the platform.',
      '',
      formatGenerationTemporalContext(),
      '',
      `Channel: ${channelEntry.channel}`,
      `Content style: ${channelEntry.contentStyle || config.contentStyle || 'platform-native'}`,
      `Caption mapping prefers: ${mapping.caption}`,
      mapping.media
        ? `Include a note if visual (${mapping.media}) is expected from upstream.`
        : '',
      '',
      `Brand: ${rule.brand.brandName}`,
      `Tone: ${rule.brand.brandTone.join(', ')}`,
      `CTA: ${rule.brand.callToAction}`,
      ...adaptChannelPromptGuardrails(channelEntry.channel),
    ]
      .filter(Boolean)
      .join('\n');

    const tiktokReminder = adaptChannelHumanReminder(channelEntry.channel);
    const human = [
      input.contentPrompt?.trim()
        ? `Campaign brief:\n${input.contentPrompt.trim()}`
        : '',
      baseText ? `Base copy to adapt:\n${baseText}` : '',
      tiktokReminder,
      'Return only the adapted post text for this channel. No quotes or labels.',
    ]
      .filter(Boolean)
      .join('\n\n');

    const res = await model.invoke([
      new SystemMessage(system),
      new HumanMessage(human),
    ]);
    const adaptedText = enforceAdaptChannelLimits(
      channelEntry.channel,
      sanitizeGeneratedPostText(
        (typeof res.content === 'string'
          ? res.content.trim()
          : String(res.content ?? '').trim()) || '',
      ),
    );

    const usage = extractUsageFromAiMessage(res);

    const outputPayload: Record<string, string> = {
      text: adaptedText,
      adaptedCaption: adaptedText,
      channel: channelEntry.channel,
    };

    if (mapping.caption === CaptionMappingSource.TranslatedText) {
      outputPayload.translatedText = adaptedText;
    } else if (mapping.caption === CaptionMappingSource.Summary) {
      outputPayload.summary = adaptedText;
    }

    return {
      output: JSON.stringify(outputPayload),
      usage,
    };
  }
}
