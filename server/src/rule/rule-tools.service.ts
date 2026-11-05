import { Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { TenancyAuth } from '../auth/tenancy.types';
import { LlmService } from '../llm/llm.service';
import { RuleAssetService } from './rule-asset.service';
import { RuleAssetSearchService } from './rule-asset-search.service';
import { RuleService } from './rule.service';
import { buildRuleBrainPrompt } from './rule-context-builder.util';
import { createSearchBrandAssetsTool } from './tools/search-brand-assets.tool';
import { createWebSearchTool } from './tools/web-search.tool';
import { runToolCallingLoop, type AgentStep } from './tools/tool-calling-loop';
import { withReactInstructions } from './chat/react-chat-instructions';

export type RuleToolsAskResult = {
  answer: string;
  steps: AgentStep[];
};

/**
 * Stateless single-turn verification endpoint for the two read tools —
 * the seed of the future chat module, no ChatSession/history yet.
 */
@Injectable()
export class RuleToolsService {
  constructor(
    private readonly ruleService: RuleService,
    private readonly ruleAssetService: RuleAssetService,
    private readonly ruleAssetSearchService: RuleAssetSearchService,
    private readonly llm: LlmService,
  ) {}

  async ask(
    ruleId: string,
    query: string,
    auth: TenancyAuth,
  ): Promise<RuleToolsAskResult> {
    const rule = await this.ruleService.getRuleById(ruleId, auth);
    const assets = await this.ruleAssetService.listByRule(ruleId, auth);
    const brainPrompt = withReactInstructions(buildRuleBrainPrompt(rule, assets));

    const model = this.llm.getChatModelForPlainText();
    const tools = [
      createSearchBrandAssetsTool(ruleId, this.ruleAssetSearchService),
      createWebSearchTool(this.llm),
    ];

    const { finalMessage, steps } = await runToolCallingLoop({
      model,
      tools,
      messages: [new SystemMessage(brainPrompt), new HumanMessage(query)],
    });

    const answer =
      typeof finalMessage.content === 'string'
        ? finalMessage.content
        : JSON.stringify(finalMessage.content);

    return { answer, steps };
  }
}
