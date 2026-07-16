import type { LineConnection as PrismaLineConnection } from '@prisma/client';

export type LineConnectionRecord = PrismaLineConnection;

export type LineAccountMetadata = {
  linkedVia: 'connect_code';
  linkedAt: string;
};
