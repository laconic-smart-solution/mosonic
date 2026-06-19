import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  IIntegrationApiKeyRepository,
  IntegrationApiKeyRecord,
} from '../interfaces/integration-api-key.repository.interface';

@Injectable()
export class PrismaIntegrationApiKeyRepository
  implements IIntegrationApiKeyRepository
{
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.IntegrationApiKeyCreateInput,
  ): Promise<IntegrationApiKeyRecord> {
    return this.prisma.integrationApiKey.create({ data });
  }

  findEnabledByKeyHash(
    keyHash: string,
  ): Promise<IntegrationApiKeyRecord | null> {
    return this.prisma.integrationApiKey.findFirst({
      where: { keyHash, enabled: true },
    });
  }
}
