import { NodeMediaSourceType } from '../schemas/workflow-node.schema';
import { resolveTranscriptionSource } from './transcription.service';

// Pure helper only: never constructs TranscriptionService / calls Whisper.
describe('resolveTranscriptionSource', () => {
  it('keeps explicit sourceUrl', () => {
    const cfg = resolveTranscriptionSource(
      { sourceUrl: ' https://cdn.example/a.mp3 ', sourceType: NodeMediaSourceType.Audio },
      { video: 'https://cdn.example/v.mp4' },
    );
    expect(cfg.sourceUrl).toBe('https://cdn.example/a.mp3');
    expect(cfg.sourceType).toBe(NodeMediaSourceType.Audio);
  });

  it('falls back to upstream video URL as video source', () => {
    const cfg = resolveTranscriptionSource({ language: 'en' }, { video: 'https://cdn.example/v.mp4' });
    expect(cfg.sourceUrl).toBe('https://cdn.example/v.mp4');
    expect(cfg.sourceType).toBe(NodeMediaSourceType.Video);
    expect(cfg.language).toBe('en');
  });

  it('ignores non-http upstream values and missing input', () => {
    expect(resolveTranscriptionSource({}, { video: 'not a url' }).sourceUrl).toBeUndefined();
    expect(resolveTranscriptionSource(undefined, undefined)).toEqual({});
  });
});
