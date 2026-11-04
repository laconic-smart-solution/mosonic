import {
  canvasNextMatrix,
  WORKFLOW_NEXT_MATRIX,
  WORKFLOW_TYPE_TO_CANVAS,
} from './workflow-node-next-matrix';

describe('workflow next matrix: transcription / subtitle', () => {
  it('video nodes can feed transcription', () => {
    expect(WORKFLOW_NEXT_MATRIX.video_presenter).toContain('transcription');
    expect(WORKFLOW_NEXT_MATRIX.video_cinematic).toContain('transcription');
    expect(WORKFLOW_NEXT_MATRIX.video_generation).toContain('transcription');
  });

  it('transcription -> subtitle -> translation / merge', () => {
    expect(WORKFLOW_NEXT_MATRIX.transcription).toEqual(
      expect.arrayContaining(['text_generation', 'summarization', 'translation', 'subtitle']),
    );
    expect(WORKFLOW_NEXT_MATRIX.subtitle).toEqual(
      expect.arrayContaining(['translation', 'merge', 'summarization']),
    );
  });

  it('canvas matrix maps subtitle', () => {
    expect(WORKFLOW_TYPE_TO_CANVAS.subtitle).toBe('subtitle');
    expect(canvasNextMatrix().transcription).toContain('subtitle');
  });
});
