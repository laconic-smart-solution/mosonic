import type { Prisma } from '@prisma/client';
import type { IntegrationApiKey } from '@prisma/client';

export type IntegrationApiKeyRecord = IntegrationApiKey;

export interface IIntegrationApiKeyRepository {
  create(
    data: Prisma.IntegrationApiKeyCreateInput,
  ): Promise<IntegrationApiKeyRecord>;
  findEnabledByKeyHash(
    keyHash: string,
  ): Promise<IntegrationApiKeyRecord | null>;
}
