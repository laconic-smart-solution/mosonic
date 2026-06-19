/** Mirrors server CreditCalculationService.calculateCredits(). */
export function creditsFromCostUsd(
  costUsd: number,
  config: {
    creditPriceUsd: number
    marginTarget: number
    overheadFactor: number
  },
): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0
  const creditPriceUsd = config.creditPriceUsd > 0 ? config.creditPriceUsd : 0.01
  const overheadUsd = costUsd * (config.overheadFactor ?? 0)
  const totalCost = costUsd + overheadUsd
  const marginAppliedUsd = totalCost * (config.marginTarget ?? 1)
  return Math.ceil(marginAppliedUsd / creditPriceUsd)
}
