import { Injectable } from '@nestjs/common';
import type {
  InstructionContract,
  SectionContractDefinition,
} from '../contracts/instruction-contract.interface';
import { createEmptyInstructionContract } from '../contracts/instruction-contract.interface';

export const BUILTIN_INSTAGRAM_7PART_TEMPLATE_ID = 'instagram_promo_7part';

export const BUILTIN_TEMPLATES: Record<string, {
  name: string;
  sections: SectionContractDefinition[];
}> = {
  [BUILTIN_INSTAGRAM_7PART_TEMPLATE_ID]: {
    name: 'Instagram 7-Part Promotional Launch',
    sections: [
      {
        key: 'headline',
        title: 'Main Headline / Catchy Slogan',
        kind: 'heading',
        required: true,
        guidelines: 'A punchy, bold slogan or hook that grabs attention immediately.',
      },
      {
        key: 'introduction',
        title: 'Product Introduction',
        kind: 'paragraph',
        required: true,
        guidelines: 'Introducing the brand and product model with a lifestyle statement.',
      },
      {
        key: 'features',
        title: 'Key Features and Benefits',
        kind: 'bullet_list',
        required: true,
        minItems: 3,
        maxItems: 6,
        guidelines: 'Bulleted key features and tangible customer benefits.',
      },
      {
        key: 'promotion',
        title: 'Promotion / Campaign Information',
        kind: 'paragraph',
        required: false,
        guidelines: 'Promotional offer, campaign details, or special discounts.',
      },
      {
        key: 'persuasion',
        title: 'Persuasive Marketing Statement',
        kind: 'paragraph',
        required: false,
        guidelines: 'Persuasive sentence encouraging customers to take action and purchase.',
      },
      {
        key: 'cta',
        title: 'Call to Action',
        kind: 'call_to_action',
        required: true,
        guidelines: 'Action-oriented closing sentence or directive (e.g. Shop Now).',
      },
      {
        key: 'hashtags',
        title: 'Campaign Hashtags',
        kind: 'hashtags',
        required: true,
        minItems: 3,
        maxItems: 10,
        guidelines: 'Relevant brand, product, and campaign hashtags.',
      },
    ],
  },
  'linkedin_thought_leadership': {
    name: 'LinkedIn Thought Leadership',
    sections: [
      {
        key: 'hook',
        title: 'Compelling Industry Hook',
        kind: 'heading',
        required: true,
        guidelines: 'A counter-intuitive or provocative industry observation.',
      },
      {
        key: 'context',
        title: 'Business Context & Problem',
        kind: 'paragraph',
        required: true,
        guidelines: 'The practical problem teams and leaders are encountering.',
      },
      {
        key: 'insights',
        title: 'Key Insights',
        kind: 'bullet_list',
        required: true,
        minItems: 3,
        maxItems: 5,
        guidelines: 'Actionable takeaways or strategic lessons.',
      },
      {
        key: 'conclusion',
        title: 'Strategic Takeaway & Question',
        kind: 'call_to_action',
        required: true,
        guidelines: 'Closing open-ended question inviting comments and discussion.',
      },
    ],
  },
};

@Injectable()
export class TemplateClassifierService {
  /**
   * Analyzes the raw user prompt and returns an InstructionContract.
   */
  classifyPrompt(rawPrompt: string): InstructionContract {
    if (!rawPrompt || typeof rawPrompt !== 'string' || !rawPrompt.trim()) {
      return createEmptyInstructionContract(rawPrompt);
    }

    const trimmed = rawPrompt.trim();

    // 1. Check for Instagram 7-Part cue words
    if (this.isInstagram7PartTemplate(trimmed)) {
      const template = BUILTIN_TEMPLATES[BUILTIN_INSTAGRAM_7PART_TEMPLATE_ID];
      return {
        contractId: `contract-${Date.now()}`,
        rawUserPrompt: trimmed,
        interpretedTopic: this.extractTopicFromPrompt(trimmed),
        templateId: BUILTIN_INSTAGRAM_7PART_TEMPLATE_ID,
        isStructured: true,
        sections: [...template.sections],
      };
    }

    // 2. Check for LinkedIn Thought Leadership cue words
    if (this.isLinkedInTemplate(trimmed)) {
      const template = BUILTIN_TEMPLATES['linkedin_thought_leadership'];
      return {
        contractId: `contract-${Date.now()}`,
        rawUserPrompt: trimmed,
        interpretedTopic: this.extractTopicFromPrompt(trimmed),
        templateId: 'linkedin_thought_leadership',
        isStructured: true,
        sections: [...template.sections],
      };
    }

    // 3. Check for custom user-defined structured template
    const customSections = this.extractCustomTemplateSections(trimmed);
    if (customSections.length >= 2) {
      return {
        contractId: `contract-${Date.now()}`,
        rawUserPrompt: trimmed,
        interpretedTopic: this.extractTopicFromPrompt(trimmed),
        isStructured: true,
        sections: customSections,
      };
    }

    // 4. Default: Unstructured plain-text generation
    return createEmptyInstructionContract(trimmed);
  }

  private isInstagram7PartTemplate(text: string): boolean {
    const cues = [
      /headline|slogan/i,
      /feature|benefit/i,
      /call to action|cta/i,
      /hashtag/i,
    ];
    const matchCount = cues.filter((re) => re.test(text)).length;
    return matchCount >= 3;
  }

  private isLinkedInTemplate(text: string): boolean {
    return /linkedin/i.test(text) && /insight|takeaway|discussion question/i.test(text);
  }

  private extractCustomTemplateSections(text: string): SectionContractDefinition[] {
    const lines = text.split('\n');
    const sections: SectionContractDefinition[] = [];
    let currentKey = '';
    let currentTitle = '';

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      // Matches numbered or markdown headings: "1. Headline", "### Intro", "**CTA**"
      const match = line.match(/^(?:(?:\d+[\.\)]|\*{1,2}|#{1,6})\s*)?([A-Za-z0-9\s/–—\-]{3,40})(?:\*{1,2}|:)?$/);
      if (match && !/^(?:the|and|or|a|an|with|for)\s/i.test(match[1])) {
        const candidateTitle = match[1].trim();
        if (candidateTitle.length >= 3 && candidateTitle.length <= 40) {
          const key = candidateTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
          if (key && !sections.some((s) => s.key === key)) {
            currentKey = key;
            currentTitle = candidateTitle;
            const kind = /bullet|feature|benefit|list/i.test(candidateTitle)
              ? 'bullet_list'
              : /call to action|cta|shop now|buy/i.test(candidateTitle)
                ? 'call_to_action'
                : /hashtag/i.test(candidateTitle)
                  ? 'hashtags'
                  : /headline|title/i.test(candidateTitle)
                    ? 'heading'
                    : 'paragraph';

            sections.push({
              key: currentKey,
              title: currentTitle,
              kind,
              required: true,
              minItems: kind === 'bullet_list' ? 2 : undefined,
              guidelines: `Content for ${currentTitle}`,
            });
          }
        }
      }
    }

    return sections;
  }

  private extractTopicFromPrompt(text: string): string {
    const firstNonEmptyLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 5) || text;
    return firstNonEmptyLine.replace(/^[#*🏎️📢🛒✨\s-]+/, '').slice(0, 120).trim();
  }
}

