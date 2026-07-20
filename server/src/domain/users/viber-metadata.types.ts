import type { ViberConnection as PrismaViberConnection } from '@prisma/client';

export type ViberConnectionRecord = PrismaViberConnection;

export type ViberAccountMetadata = {
  linkedVia: 'connect_code';
  linkedAt: string;
};
