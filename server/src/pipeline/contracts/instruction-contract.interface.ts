import type { SectionKind } from '../../content/schemas/structured-content.schema';

export interface SectionContractDefinition {
  key: string;                    // Machine identifier, e.g. 'headline', 'features', 'cta'
  title: string;                  // Display title in UI
  kind: SectionKind;
  required: boolean;
  minItems?: number;              // Applicable for bullet_list or hashtags
  maxItems?: number;              // Applicable for bullet_list or hashtags
  guidelines?: string;            // Prompt guidance for this specific section
  placeholder?: string;           // Template placeholder or example
}

export interface InstructionContract {
  contractId: string;
  rawUserPrompt: string;          // Verbatim input received from user
  interpretedTopic: string;       // Condensed topic for context/image prompts
  templateId?: string;           // Predefined template key (e.g. 'instagram_promo_7part')
  isStructured: boolean;          // True when multi-section template is active
  sections: SectionContractDefinition[];
  channelRules?: Record<string, {
    maxCharacters?: number;
    preferredKind?: SectionKind;
    allowedFormatting?: string[];
  }>;
}

export function createEmptyInstructionContract(rawUserPrompt = ''): InstructionContract {
  return {
    contractId: `contract-${Date.now()}`,
    rawUserPrompt,
    interpretedTopic: rawUserPrompt.slice(0, 100).trim(),
    isStructured: false,
    sections: [],
  };
}

