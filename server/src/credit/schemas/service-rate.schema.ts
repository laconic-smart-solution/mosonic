export { ServiceRateType } from '@prisma/client';

import type { ServiceRateType } from '@prisma/client';

export interface ServiceRate {
  serviceRateId: string;
  serviceType: ServiceRateType;
  provider: string;
  model: string;
  avgPricePerCall?: number;
  pricePerImage?: number;
  pricePerSecond?: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ServiceRateDocument = ServiceRate;
