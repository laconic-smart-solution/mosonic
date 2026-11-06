import {
  BILLABLE_NODE_CREDIT_DEFAULTS,
  defaultCostUsdForNodeType,
  VIDEO_GENERATION_CINEMATIC_CREDIT_TYPE,
  VIDEO_GENERATION_PRESENTER_CREDIT_TYPE,
} from '../../credit/lib/billable-node-credit-types';

/** Fallback credit config — same seeds as CreditCalculationService.getConfig(). */
export const LIST_PRICE_CREDIT_CONFIG = {
  creditPriceUsd: 0.01,
  marginTarget: 3.0,
  overheadFactor: 0,
} as const;

export type CreditConfigLike = {
  creditPriceUsd: number;
  marginTarget: number;
  overheadFactor: number;
};

/**
 * THE billing formula (CreditCalculationService.calculateCredits):
 *   overheadUsd = rawCostUsd * overheadFactor
 *   marginAppliedUsd = (rawCostUsd + overheadUsd) * marginTarget
 *   creditsCharged = ceil(marginAppliedUsd / creditPriceUsd)
 */
export function creditsFromRawCostUsd(
  rawCostUsd: number,
  config: CreditConfigLike = LIST_PRICE_CREDIT_CONFIG,
): number {
  if (!(rawCostUsd > 0) || !(config.creditPriceUsd > 0)) return 0;
  const overheadUsd = rawCostUsd * config.overheadFactor;
  const marginAppliedUsd = (rawCostUsd + overheadUsd) * config.marginTarget;
  return Math.ceil(marginAppliedUsd / config.creditPriceUsd);
}

/** Map a workflow node type (+ config) to the admin billable credit key. */
export function creditTypeForPreviewStep(
  type: string,
  settings?: Record<string, unknown> | null,
): string {
  const t = String(type ?? '');
  if (t === 'video_presenter') return VIDEO_GENERATION_PRESENTER_CREDIT_TYPE;
  if (t === 'video_cinematic') return VIDEO_GENERATION_CINEMATIC_CREDIT_TYPE;
  if (t === 'video_generation') {
    const mode = String(settings?.mode ?? settings?.cinematicMode ?? '');
    if (mode === 'presenter' || mode === 'cinematic_avatar') {
      return VIDEO_GENERATION_PRESENTER_CREDIT_TYPE;
    }
    return VIDEO_GENERATION_CINEMATIC_CREDIT_TYPE;
  }
  return t;
}

export type RunCreditEstimate = {
  /** Image steps that will run (1 image each today). */
  images: number;
  /** Sum of list-price credits per billable step (admin defaults + fallback config). */
  credits: number;
  /** Honest label: prices may differ once admin overrides / live config load. */
  basis: 'list_price';
};

/**
 * Estimate credits for a generation preview from step types.
 * Uses BILLABLE_NODE_CREDIT_DEFAULTS + LIST_PRICE_CREDIT_CONFIG — same path as
 * NodeCreditPriceService when DB rows match seeds. Not a live DB read.
 */
export function estimatePipelineCredits(
  steps: ReadonlyArray<{ type: string; settings?: Record<string, unknown> | null }>,
  config: CreditConfigLike = LIST_PRICE_CREDIT_CONFIG,
): RunCreditEstimate {
  let images = 0;
  let credits = 0;
  for (const step of steps) {
    const creditType = creditTypeForPreviewStep(step.type, step.settings);
    if (creditType === 'image_generation' || step.type === 'image_generation') {
      images += 1;
    }
    const usd = defaultCostUsdForNodeType(creditType);
    if (usd != null) credits += creditsFromRawCostUsd(usd, config);
  }
  return { images, credits, basis: 'list_price' };
}

/** Expose defaults for tests. */
export function listPriceCostUsd(nodeType: string): number | null {
  return defaultCostUsdForNodeType(nodeType) ??
    BILLABLE_NODE_CREDIT_DEFAULTS.find((r) => r.nodeType === nodeType)?.costUsd ??
    null;
}
