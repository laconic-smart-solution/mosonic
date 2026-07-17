import type { TelegramConnection as PrismaTelegramConnection } from '@prisma/client';

export type TelegramConnectionRecord = PrismaTelegramConnection;

export type TelegramAccountMetadata = {
  linkedVia: 'connect_code';
  linkedAt: string;
};
