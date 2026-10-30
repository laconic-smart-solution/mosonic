/** Mirrors faq/'s RecursiveCharacterTextSplitter settings (chunk_size=1200, chunk_overlap=150). */
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

/** Below this, text goes straight into `extractedText` and skips chunking/embedding entirely. */
export const RAG_TEXT_LENGTH_THRESHOLD = 2000;

export function splitTextIntoChunks(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 0);
}
