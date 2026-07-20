import type { WhatsAppConnection as PrismaWhatsAppConnection } from '@prisma/client';

export type WhatsAppConnectionRecord = PrismaWhatsAppConnection;

export type WhatsAppAccountMetadata = {
  linkedVia: 'connect_code';
  linkedAt: string;
};
