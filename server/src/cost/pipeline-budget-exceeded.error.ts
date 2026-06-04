export class PipelineBudgetExceededError extends Error {
  readonly code = 'PIPELINE_BUDGET_EXCEEDED' as const;

  constructor(
    message: string,
    readonly scope: 'monthly' | 'run',
  ) {
    super(message);
    this.name = 'PipelineBudgetExceededError';
  }
}
