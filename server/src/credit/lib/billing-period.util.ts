/** First day of current month at local midnight (matches CostService billing period). */
export function currentBillingPeriod(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** First day of previous calendar month at local midnight. */
export function previousBillingPeriod(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}
