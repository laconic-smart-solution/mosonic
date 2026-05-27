import {
  pendingRunStatus,
  skipReasonToMessage,
  summarizeNewsTriggerLog,
} from './news-trigger-run-summary.util';

describe('news-trigger-run-summary.util', () => {
  it('pendingRunStatus returns running', () => {
    expect(pendingRunStatus('run-1')).toEqual({
      runId: 'run-1',
      status: 'running',
      message: 'News check queued…',
    });
  });

  it('summarizeNewsTriggerLog returns running when not completed', () => {
    const out = summarizeNewsTriggerLog(
      { runId: 'r1', completedAt: null, articlesFetched: 0 },
      'rule-1',
    );
    expect(out.status).toBe('running');
  });

  it('summarizeNewsTriggerLog returns failed on errorMessage', () => {
    const out = summarizeNewsTriggerLog(
      {
        runId: 'r1',
        completedAt: new Date('2026-01-01'),
        errorMessage: 'rule not found',
      },
      'rule-1',
    );
    expect(out.status).toBe('failed');
    expect(out.message).toBe('rule not found');
  });

  it('summarizeNewsTriggerLog returns triggered when pipeline started', () => {
    const out = summarizeNewsTriggerLog(
      {
        runId: 'r1',
        completedAt: new Date('2026-01-01'),
        pipelinesTriggered: 1,
        details: [
          {
            ruleId: 'rule-1',
            userId: 'u1',
            articleTitle: 'Big Tech News',
            relevanceScore: 85,
            pipelineId: 'pipe-1',
            triggered: true,
          },
        ],
      },
      'rule-1',
    );
    expect(out.status).toBe('completed');
    expect(out.outcome).toBe('triggered');
    expect(out.pipelineId).toBe('pipe-1');
    expect(out.message).toContain('Big Tech News');
  });

  it('summarizeNewsTriggerLog returns skipped with friendly message', () => {
    const out = summarizeNewsTriggerLog(
      {
        runId: 'r1',
        completedAt: new Date('2026-01-01'),
        pipelinesTriggered: 0,
        articlesFetched: 0,
        details: [
          {
            ruleId: 'rule-1',
            userId: 'u1',
            articleTitle: 'Some headline',
            triggered: false,
            skipReason: 'keyword pre-filter failed',
          },
        ],
      },
      'rule-1',
    );
    expect(out.status).toBe('completed');
    expect(out.outcome).toBe('skipped');
    expect(out.message).toBe('No article contained your required keywords.');
  });

  it('skipReasonToMessage maps max posts', () => {
    expect(skipReasonToMessage('max posts per day (1) reached')).toContain(
      'Daily news post limit',
    );
  });
});
