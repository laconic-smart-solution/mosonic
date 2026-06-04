/** Stream-safe read with upper bound (browser/fetch Response). */
export async function readResponseBodyLimited(
  res: Response,
  maxBytes: number,
): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) {
    const ab = await res.arrayBuffer();
    return Buffer.from(ab.slice(0, maxBytes));
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    const buf = Buffer.from(value);
    const remaining = maxBytes - total;
    if (remaining <= 0) break;
    if (buf.length <= remaining) {
      chunks.push(buf);
      total += buf.length;
    } else {
      chunks.push(buf.subarray(0, remaining));
      total += remaining;
      break;
    }
  }
  return Buffer.concat(chunks);
}
