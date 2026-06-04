import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EventsService } from '../../events/events.service';
import { LlmService } from '../../llm/llm.service';
import {
  IntelligenceSearchType,
  type IntelligenceSearchTypeValue,
} from '../workflow-node-config.zod';
import type {
  NodeExecutionInput,
  NodeExecutionResult,
} from '../types/node-execution.types';
import {
  appendAnalyticsContextToPrompt,
  buildIntelligenceSearchPrompt,
} from './intelligence-search.util';

@Injectable()
export class IntelligenceNodeService {
  constructor(
    private readonly llm: LlmService,
    private readonly events: EventsService,
  ) {}

  private emitProcessing(
    pipelineId: string,
    nodeId: string,
    message: string,
  ): void {
    try {
      this.events.emitToPipeline(pipelineId, 'node:processing', {
        pipelineId,
        nodeId,
        message,
      });
    } catch {
      // noop
    }
  }

  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    if (!input.rule) {
      throw new UnprocessableEntityException(
        'Intelligence requires `rule` on NodeExecutionInput',
      );
    }

    const rawSearchType = input.config?.searchType;
    const searchTypeParsed = IntelligenceSearchType.safeParse(rawSearchType);
    const searchType: IntelligenceSearchTypeValue = searchTypeParsed.success
      ? searchTypeParsed.data
      : 'all';

    const customPrompt =
      typeof input.config?.customPrompt === 'string'
        ? input.config.customPrompt
        : input.config?.customPrompt === null
          ? null
          : undefined;

    const model =
      typeof input.config?.model === 'string' ? input.config.model : 'gpt-4o';

    if (searchType === 'custom' && !customPrompt?.trim()) {
      throw new UnprocessableEntityException(
        'customPrompt is required when searchType is custom',
      );
    }

    const pipelineId = input.pipelineRef;
    const nodeId = input.nodeId;
    if (pipelineId && nodeId) {
      this.emitProcessing(
        pipelineId,
        nodeId,
        `Gathering ${searchType} intelligence via web search...`,
      );
    }

    let prompt = buildIntelligenceSearchPrompt(
      searchType,
      input.rule,
      customPrompt ?? null,
    );
    prompt = appendAnalyticsContextToPrompt(prompt, input.intelligenceContext);

    const { text, usage } = await this.llm.runWebSearchBrief({
      prompt,
      model,
      provider: input.config?.provider,
    });

    const intelligenceBrief = text || 'No intelligence brief returned.';

    if (pipelineId && nodeId) {
      this.emitProcessing(pipelineId, nodeId, 'Intelligence brief ready.');
    }

    return {
      output: JSON.stringify({
        searchType,
        intelligenceBrief,
        intelligenceHints: intelligenceBrief,
      }),
      usage,
    };
  }
}
