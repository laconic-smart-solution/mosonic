import { PDFParse } from 'pdf-parse';

/** Extract plain text from PDF bytes (fallback when vision/API rejects PDF). */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? '';
  } finally {
    await parser.destroy();
  }
}
