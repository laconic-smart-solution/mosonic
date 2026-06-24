export interface WebhookEvent {
  eventId: string;
  event: string;
  processedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WebhookEventDocument = WebhookEvent;
