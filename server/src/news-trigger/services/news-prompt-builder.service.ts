import { Injectable } from '@nestjs/common';
import type { Rule } from '../../rule/schemas/rule.schema';
import { PickedArticle } from './news-picker.service';
import { RelevanceResult } from './news-relevance.service';

@Injectable()
export class NewsPromptBuilderService {
  build(params: {
    article: PickedArticle;
    relevance: RelevanceResult;
    rule: Rule;
  }): string {
    const { article, relevance, rule } = params;

    const lines: string[] = [
      `Based on recent news: "${article.title}"`,
      '',
    ];

    if (relevance.suggestedAngle) {
      lines.push(relevance.suggestedAngle);
      lines.push('');
    }

    lines.push(
      `Write content for ${rule.brand.brandName} (${rule.brand.industry}).`,
      `Brand tone: ${rule.brand.brandTone.join(', ')}.`,
      `Target audience: ${rule.audience.description}.`,
      `Campaign goal: ${rule.campaign.goals[0] ?? 'brand awareness'}.`,
    );

    if (rule.contentGuidelines?.requiredElements?.length) {
      lines.push(
        `Required elements: ${rule.contentGuidelines.requiredElements.slice(0, 3).join(', ')}.`,
      );
    }

    if (rule.contentGuidelines?.donts?.length) {
      lines.push(
        `Avoid: ${rule.contentGuidelines.donts.slice(0, 3).join(', ')}.`,
      );
    }

    return lines.join('\n');
  }
}
