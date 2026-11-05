import { generateMoreOutputMissing } from './generate-more-outcome.util';

describe('generateMoreOutputMissing', () => {
  it('flags a video with no url and no job', () => {
    expect(generateMoreOutputMissing('video_presenter', {})).toMatch(/without a video/);
    expect(generateMoreOutputMissing('video_cinematic', { video: '  ' })).toMatch(/without a video/);
  });
  it('accepts a video url or a render job', () => {
    expect(generateMoreOutputMissing('video_presenter', { video: 'https://x/v.mp4' })).toBeNull();
    expect(generateMoreOutputMissing('video_cinematic', { jobId: 'j1' })).toBeNull();
  });
  it('flags an image with no image', () => {
    expect(generateMoreOutputMissing('image_generation', { text: 'x' })).toMatch(/without an image/);
    expect(generateMoreOutputMissing('image_generation', { image: 'https://x/i.png' })).toBeNull();
  });
  it('ignores text steps', () => {
    expect(generateMoreOutputMissing('adapt', {})).toBeNull();
  });
});
