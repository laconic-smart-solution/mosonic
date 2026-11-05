import {
  buildSrt,
  buildSubtitleCues,
  buildVtt,
  formatSubtitleTimestamp,
  resolveSubtitleSourceText,
  splitSentences,
  SubtitleService,
  wrapLines,
} from './subtitle.service';

const FIXTURE =
  'Welcome to our summer sale. Everything in store is twenty percent off this weekend only! Visit us today.';

describe('subtitle helpers (fixture only, no AI)', () => {
  it('splits sentences', () => {
    expect(splitSentences(FIXTURE)).toEqual([
      'Welcome to our summer sale.',
      'Everything in store is twenty percent off this weekend only!',
      'Visit us today.',
    ]);
  });

  it('wraps lines within maxChars and hard-splits long tokens', () => {
    const lines = wrapLines('one two three four five six', 10);
    expect(lines.every((l) => l.length <= 10)).toBe(true);
    expect(lines.join(' ')).toBe('one two three four five six');
    expect(wrapLines('abcdefghijklmnop', 10)).toEqual(['abcdefghij', 'klmnop']);
  });

  it('formats timestamps for srt and vtt', () => {
    expect(formatSubtitleTimestamp(3661.5, 'srt')).toBe('01:01:01,500');
    expect(formatSubtitleTimestamp(0, 'vtt')).toBe('00:00:00.000');
  });

  it('spreads cues over the given duration, contiguous and ending at total', () => {
    const cues = buildSubtitleCues(FIXTURE, { audioDurationSeconds: 12 });
    expect(cues.length).toBeGreaterThanOrEqual(3);
    expect(cues[0].startSeconds).toBe(0);
    expect(cues[cues.length - 1].endSeconds).toBe(12);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].startSeconds).toBe(cues[i - 1].endSeconds);
    }
  });

  it('estimates duration from word count when unknown', () => {
    const cues = buildSubtitleCues(FIXTURE);
    // 18 words / 2.5 wps -> 8s
    expect(cues[cues.length - 1].endSeconds).toBe(8);
  });

  it('builds SRT', () => {
    const srt = buildSrt('Hello world. Bye now.', { audioDurationSeconds: 4 });
    expect(srt).toBe(
      '1\n00:00:00,000 --> 00:00:02,000\nHello world.\n\n2\n00:00:02,000 --> 00:00:04,000\nBye now.\n',
    );
  });

  it('builds VTT with header', () => {
    const vtt = buildVtt('Hello world.', { audioDurationSeconds: 2 });
    expect(vtt).toBe('WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello world.\n');
  });

  it('keeps at most 2 lines per cue', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const cues = buildSubtitleCues(long, { maxCharsPerLine: 20 });
    expect(cues.every((c) => c.text.split('\n').length <= 2)).toBe(true);
  });

  it('resolves source text: config.sourceText over transcription', () => {
    expect(resolveSubtitleSourceText({ sourceText: ' A ' }, { transcription: 'B' })).toBe('A');
    expect(resolveSubtitleSourceText({}, { transcription: ' B ' })).toBe('B');
    expect(resolveSubtitleSourceText({}, {})).toBe('');
  });
});

describe('SubtitleService.execute', () => {
  const svc = new SubtitleService();

  it('returns srt by default from upstream transcription', async () => {
    const res = await svc.execute({
      previousOutputs: { transcription: 'Hello world.' },
      config: { audioDurationSeconds: 2 },
    } as never);
    expect(res.subtitleFormat).toBe('srt');
    expect(res.subtitle).toContain('00:00:00,000 --> 00:00:02,000');
    expect(res.output).toBe(res.subtitle);
    expect(res.audioDurationSeconds).toBe(2);
  });

  it('returns vtt when configured', async () => {
    const res = await svc.execute({
      previousOutputs: { transcription: 'Hi.' },
      config: { format: 'vtt' },
    } as never);
    expect(res.subtitle?.startsWith('WEBVTT')).toBe(true);
  });

  it('fails clearly without source text', async () => {
    await expect(svc.execute({ previousOutputs: {}, config: {} } as never)).rejects.toThrow(
      /requires upstream transcription/,
    );
  });
});
