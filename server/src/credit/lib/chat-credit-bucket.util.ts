export type ChatCreditBucketApply = {
  unbilledUsd: number;
  addUsd: number;
  creditPriceUsd: number;
};

export type ChatCreditBucketResult = {
  creditsCharged: number;
  unbilledUsd: number;
};

function roundUsd(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/**
 * Accrue billed chat USD and take only whole credits.
 * Leftover stays in the bucket until the next turn.
 */
export function applyChatCreditBucket(
  args: ChatCreditBucketApply,
): ChatCreditBucketResult {
  const next = roundUsd(Math.max(0, args.unbilledUsd) + Math.max(0, args.addUsd));
  const price = args.creditPriceUsd;
  if (!(price > 0) || next < price) {
    return { creditsCharged: 0, unbilledUsd: next };
  }
  const creditsCharged = Math.floor((next + 1e-12) / price);
  const unbilledUsd = roundUsd(next - creditsCharged * price);
  return {
    creditsCharged,
    unbilledUsd: unbilledUsd < 1e-12 ? 0 : unbilledUsd,
  };
}
