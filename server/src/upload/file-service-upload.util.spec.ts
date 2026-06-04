import {
  buildVideoUploadAttempts,
  isVideoUpload,
  normalizeMediaUploadMeta,
} from './file-service-upload.util';

describe('file-service-upload.util', () => {
  it('detects video by extension and MIME', () => {
    expect(isVideoUpload('clip.mp4', '')).toBe(true);
    expect(isVideoUpload('clip', 'video/mp4')).toBe(true);
    expect(isVideoUpload('photo.png', 'image/png')).toBe(false);
  });

  it('normalizes mp4 uploads to video/mp4 when browser sends octet-stream', () => {
    const n = normalizeMediaUploadMeta(
      'recording.mp4',
      'application/octet-stream',
    );
    expect(n.mediaKind).toBe('video');
    expect(n.fileName).toBe('recording.mp4');
    expect(n.mimeType).toBe('video/mp4');
    expect(n.folderPath).toBe('neural-tex/videos');
  });

  it('adds .mp4 when extension is missing but MIME is video', () => {
    const n = normalizeMediaUploadMeta('recording', 'video/mp4');
    expect(n.fileName).toBe('recording.mp4');
    expect(n.mimeType).toBe('video/mp4');
  });

  it('preserves webm MIME and extension', () => {
    const n = normalizeMediaUploadMeta('a.webm', 'video/webm');
    expect(n.fileName).toBe('a.webm');
    expect(n.mimeType).toBe('video/webm');
  });

  it('routes images to neural-tex/images', () => {
    const n = normalizeMediaUploadMeta('pic.png', 'image/png');
    expect(n.mediaKind).toBe('image');
    expect(n.folderPath).toBe('neural-tex/images');
  });

  it('includes non-mp4 video upload attempts after the primary mp4 attempt', () => {
    const normalized = normalizeMediaUploadMeta('clip.mp4', 'video/mp4');
    const attempts = buildVideoUploadAttempts(normalized);
    expect(attempts[0]?.fileName).toBe('clip.mp4');
    expect(attempts.some((a) => a.fileName.endsWith('.mov'))).toBe(true);
    expect(attempts.some((a) => !a.fileName.toLowerCase().endsWith('.mp4'))).toBe(
      true,
    );
  });

  it('video upload attempts always include a file extension', () => {
    const normalized = normalizeMediaUploadMeta('recording', 'video/mp4');
    for (const a of buildVideoUploadAttempts(normalized)) {
      expect(a.fileName).toMatch(/\.[a-z0-9]{2,}$/i);
    }
  });
});
