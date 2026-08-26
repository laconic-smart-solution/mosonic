/**
 * RedNote rejects topics/hashtags that contain special symbols
 * ("话题内不允许包含特殊符号"). Keep only letters, numbers, and CJK in topic bodies.
 */
const TOPIC_SAFE = /[^\p{L}\p{N}\u4e00-\u9fff]/gu;

/** Strip characters that RedNote treats as illegal inside #topics#. */
export function sanitizeRedNoteTopicLabel(raw: string): string {
  return raw.replace(TOPIC_SAFE, '').trim();
}

/**
 * Sanitize caption for RedNote publish:
 * - Clean `#topic#` and `#hashtag` bodies (drop topic if nothing safe remains)
 * - Normalize whitespace
 */
export function sanitizeRedNoteCaption(raw: string): string {
  let text = (raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  // Xiaohongshu double-hash topics: #话题#
  text = text.replace(/#([^#\n]{1,60})#/g, (_full, topic: string) => {
    const cleaned = sanitizeRedNoteTopicLabel(topic);
    return cleaned ? `#${cleaned}#` : '';
  });

  // Single #hashtag tokens
  text = text.replace(
    /(^|[\s\n])#([^\s#]+)/g,
    (_full, lead: string, tag: string) => {
      const cleaned = sanitizeRedNoteTopicLabel(tag);
      return cleaned ? `${lead}#${cleaned}` : lead;
    },
  );

  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Title: first line, no #, max 20 chars (creator UI limit). */
export function sanitizeRedNoteTitle(raw: string): string {
  const firstLine = (raw ?? '').trim().split(/\r?\n/)[0]?.trim() ?? '';
  const withoutHash = firstLine.replace(/#/g, ' ').replace(/\s+/g, ' ').trim();
  return withoutHash.slice(0, 20);
}
