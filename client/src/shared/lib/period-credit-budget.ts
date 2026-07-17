/**
 * Effective spendable budget for the current billing period.
 * Includes plan allotment plus any top-ups (reflected in remaining + used).
 */
export function periodCreditBudget(args: {
  creditsPerMonth: number
  creditsUsed: number
  creditsRemaining: number
}): number {
  const safeRemaining = Math.max(0, args.creditsRemaining)
  return Math.max(args.creditsPerMonth, args.creditsUsed + safeRemaining)
}
