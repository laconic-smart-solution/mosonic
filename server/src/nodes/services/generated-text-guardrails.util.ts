/**
 * Removes common "meta" artifacts that are not publishable social copy, e.g.
 * image art-direction blocks like "[Visual: ...]" or sections like
 * "Translated text overlays: ...".
 *
 * Keep this deterministic: it should never add content, only remove.
 */
export function sanitizeGeneratedPostText(input: string): string {
  if (!input) return '';

  // Some providers / intermediates may double-escape newlines (e.g. "\\n").
  let text = input
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');

  // Remove bracketed art-direction blocks: [Visual: ...], [Image: ...], etc.
  text = text.replace(
    /\[(?:visual|image|scene|shot|prompt|art|graphic)\s*:[\s\S]*?\]/gi,
    '',
  );

  const lines = text.split('\n');
  const out: string[] = [];
  let skippingOverlay = false;

  for (const raw of lines) {
    const line = raw ?? '';
    const trimmed = line.trim();

    if (skippingOverlay) {
      if (!trimmed) {
        skippingOverlay = false;
      }
      continue;
    }

    if (/translated\s+text\s+overlays?/i.test(trimmed)) {
      skippingOverlay = true;
      continue;
    }

    // Non-bracketed meta instructions that sometimes leak into captions.
    if (/^(visual|image|scene|shot|prompt|graphic)\s*:/i.test(trimmed)) {
      continue;
    }

    // Remove leftover single-line bracket instructions like "[...: ...]".
    if (
      /^\[[^\]]+\]\s*$/.test(trimmed) &&
      /^(?:\[[a-z\s]{2,20}\s*:)/i.test(trimmed)
    ) {
      continue;
    }

    out.push(line);
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

