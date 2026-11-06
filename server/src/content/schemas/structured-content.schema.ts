/**
 * Structured content models and discriminated union types for Mosonic.
 * Supports diverse social formats, video scenes, scripts, and custom templates.
 */

export const SECTION_KINDS = [
  'heading',
  'paragraph',
  'bullet_list',
  'numbered_list',
  'call_to_action',
  'hashtags',
  'quote',
  'rich_text',
  'link',
  'image_direction',
  'video_scene',
  'script',
  'custom_block',
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

/** Type-safe discriminated union supporting diverse social channels, scripts, and video prompts. */
export type SectionPayload =
  | { kind: 'heading'; text: string; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet_list'; items: string[] }
  | { kind: 'numbered_list'; items: string[] }
  | { kind: 'call_to_action'; text: string; url?: string; actionType?: string }
  | { kind: 'hashtags'; tags: string[] }
  | { kind: 'quote'; quote: string; attribution?: string }
  | { kind: 'link'; title: string; url: string; previewText?: string }
  | { kind: 'image_direction'; visualDescription: string; aspectPrompt?: string }
  | { kind: 'video_scene'; sceneNumber: number; visual: string; narration?: string; durationSeconds?: number }
  | { kind: 'script'; speaker: string; dialogue: string; cues?: string }
  | { kind: 'rich_text'; markdown: string }
  | { kind: 'custom_block'; blockType: string; data: Record<string, unknown> };

export interface ContentSectionItem {
  key: string;                    // Machine identifier, e.g. 'headline', 'features', 'cta'
  title: string;                  // Human display title, e.g. 'Main Headline / Catchy Slogan'
  kind: SectionKind;
  content?: string;                // Primary string content or formatted markdown
  items?: string[];               // Extracted items for bullet/numbered lists or hashtags
  charCount?: number;
  required?: boolean;
}

export interface StructuredContentPayload {
  templateId?: string;
  sections: ContentSectionItem[];
  compiledText: string;
}

