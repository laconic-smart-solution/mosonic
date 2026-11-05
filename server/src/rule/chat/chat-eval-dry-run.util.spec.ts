import { dryRunGenerationResult } from './chat-eval-dry-run.util';
import { isPipelineStartedObservation } from '../tools/start-generation.tool';

describe('dryRunGenerationResult', () => {
  it('fakes a started run for start_generation without a real pipeline id', () => {
    const result = dryRunGenerationResult('start_generation', { contentPrompt: 'Launch post' })!;
    expect(isPipelineStartedObservation(result)).toBe(true);
    const parsed = JSON.parse(result);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.pipelineId).toMatch(/^dryrun-/);
    expect(parsed.contentPrompt).toBe('Launch post');
  });

  it('covers rerun and generate-more, and ignores every other tool', () => {
    expect(JSON.parse(dryRunGenerationResult('rerun_content_node', {})!).action).toBe('content_rerun_started');
    expect(JSON.parse(dryRunGenerationResult('generate_more_image', {})!).action).toBe('generate_more_started');
    expect(JSON.parse(dryRunGenerationResult('generate_more_adapt', {})!).action).toBe('generate_more_started');
    expect(dryRunGenerationResult('update_rule', {})).toBeNull();
    expect(dryRunGenerationResult('list_workflows', {})).toBeNull();
  });

  it('produces ids the follow-up watcher can skip', () => {
    const result = dryRunGenerationResult('start_generation', { contentPrompt: 'x' })!;
    // chat-session.service skips ids with this prefix when linking follow-ups.
    expect(JSON.parse(result).pipelineId.startsWith('dryrun-')).toBe(true);
  });
});
