/** A generate-more image/video run that "finished" with no file or render job is a failure, not a success. */
export function generateMoreOutputMissing(type: unknown, output: unknown): string | null {
  const t = String(type ?? '');
  const isVideo = t.includes('video');
  if (!isVideo && !t.includes('image')) return null;
  const o = output && typeof output === 'object' ? (output as Record<string, unknown>) : {};
  const keys = isVideo
    ? ['video', 'videoUrl', 'url', 'jobId', 'videoId', 'heygenVideoId']
    : ['image', 'imageUrl', 'url', 'images'];
  const present = keys.some((k) => {
    const v = o[k];
    if (typeof v === 'string') return !!v.trim();
    if (Array.isArray(v)) return v.length > 0;
    return !!v && typeof v === 'object';
  });
  if (present) return null;
  return isVideo
    ? 'The video step finished without a video or a render job.'
    : 'The image step finished without an image.';
}
