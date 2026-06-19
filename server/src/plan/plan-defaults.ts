import type { CreatePlanDto } from './dto/create-plan.dto';

/** Default subscription tiers seeded on first run / bootstrap migration. */
export const DEFAULT_PLANS: CreatePlanDto[] = [
  {
    name: 'Free',
    priceThb: 0,
    priceUsd: 0,
    creditsOverride: 1000,
    description: 'Free starter plan with monthly credits.',
    features: ['1,000 credits / month', 'Community support'],
  },
  {
    name: 'Basic',
    priceThb: 1200,
    priceUsd: 35,
    description: 'For individuals and small teams getting started.',
    features: ['All node types', 'Email support'],
  },
  {
    name: 'Professional',
    priceThb: 2000,
    priceUsd: 58,
    description: 'For growing teams with higher volume needs.',
    features: ['Priority support', 'Advanced workflows'],
  },
  {
    name: 'Enterprise',
    priceThb: 4000,
    priceUsd: 115,
    description: 'For agencies and enterprises at scale.',
    features: ['Dedicated support', 'Custom integrations'],
  },
];
