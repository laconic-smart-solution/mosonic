import type { ContentSectionItem } from './schemas/structured-content.schema';

/**
 * Compiles modular content sections into a unified Markdown string.
 * This ensures that legacy consumers, social publishers, and plain-text
 * previews always receive a clean, ready-to-publish representation.
 */
export function compileSectionsToMarkdown(sections: ContentSectionItem[]): string {
  if (!sections || !Array.isArray(sections) || sections.length === 0) {
    return '';
  }

  const blocks: string[] = [];

  for (const sec of sections) {
    const title = sec.title?.trim() || '';
    const content = sec.content?.trim() || '';
    const items = Array.isArray(sec.items) ? sec.items.map((i) => String(i).trim()).filter(Boolean) : [];

    switch (sec.kind) {
      case 'heading': {
        if (title && content && title !== content) {
          blocks.push(`### ${title}\n${content}`);
        } else {
          blocks.push(`### ${content || title}`);
        }
        break;
      }
      case 'bullet_list': {
        const header = title ? `**${title}**\n` : '';
        const bulletLines = items.length > 0
          ? items.map((it) => (it.startsWith('•') || it.startsWith('-') || it.startsWith('✨') ? it : `• ${it}`)).join('\n')
          : content;
        if (bulletLines) {
          blocks.push(`${header}${bulletLines}`.trim());
        }
        break;
      }
      case 'numbered_list': {
        const header = title ? `**${title}**\n` : '';
        const numberedLines = items.length > 0
          ? items.map((it, idx) => (/^\d+[\.\)]\s+/.test(it) ? it : `${idx + 1}. ${it}`)).join('\n')
          : content;
        if (numberedLines) {
          blocks.push(`${header}${numberedLines}`.trim());
        }
        break;
      }
      case 'call_to_action': {
        const ctaText = content || title;
        blocks.push(`**${ctaText}**`);
        break;
      }
      case 'hashtags': {
        const tagList = items.length > 0
          ? items.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')
          : content;
        if (tagList) {
          blocks.push(tagList);
        }
        break;
      }
      case 'quote': {
        const quoteLines = content.split('\n').map((l) => `> ${l}`).join('\n');
        blocks.push(quoteLines);
        break;
      }
      case 'paragraph':
      case 'rich_text':
      default: {
        if (title && content && !content.toLowerCase().startsWith(title.toLowerCase())) {
          blocks.push(`**${title}**\n${content}`);
        } else {
          blocks.push(content || title);
        }
        break;
      }
    }
  }

  return blocks.filter(Boolean).join('\n\n').trim();
}

/**
 * Heuristically parses structured Markdown text into sections as a fallback.
 */
export function parseMarkdownToSections(markdown: string): ContentSectionItem[] {
  if (!markdown || typeof markdown !== 'string') return [];
  const text = markdown.trim();
  if (!text) return [];

  const rawBlocks = text.split(/\n{2,}/);
  const sections: ContentSectionItem[] = [];

  for (let idx = 0; idx < rawBlocks.length; idx++) {
    const block = rawBlocks[idx].trim();
    if (!block) continue;

    // Heading block: ### or # or **...** on single line
    if (/^#{1,6}\s+(.+)$/m.test(block)) {
      const match = block.match(/^#{1,6}\s+(.+)$/m);
      sections.push({
        key: `section_${idx + 1}`,
        title: match ? match[1].trim() : `Section ${idx + 1}`,
        kind: 'heading',
        content: block,
      });
      continue;
    }

    // Hashtag block
    if (/^(?:#\w+\s*)+$/m.test(block)) {
      const tags = block.match(/#\w+/g) || [];
      sections.push({
        key: 'hashtags',
        title: 'Hashtags',
        kind: 'hashtags',
        content: block,
        items: tags,
      });
      continue;
    }

    // Bullet list block
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const isBulletList = lines.every((l) => /^[-*•✨👉🔥✅🛒📢🏎️]/.test(l));
    if (isBulletList && lines.length > 1) {
      sections.push({
        key: `list_${idx + 1}`,
        title: `List ${idx + 1}`,
        kind: 'bullet_list',
        content: block,
        items: lines.map((l) => l.replace(/^[-*•✨👉🔥✅🛒📢🏎️]\s*/, '').trim()),
      });
      continue;
    }

    // Default paragraph
    sections.push({
      key: `paragraph_${idx + 1}`,
      title: `Paragraph ${idx + 1}`,
      kind: 'paragraph',
      content: block,
    });
  }

  return sections;
}

