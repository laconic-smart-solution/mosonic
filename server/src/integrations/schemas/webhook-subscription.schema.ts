export interface WebhookSubscription {
  subscriptionId: string;
  userId: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WebhookSubscriptionDocument = WebhookSubscription;

export interface WebhookDelivery {
  deliveryId: string;
  subscriptionId: string;
  event: string;
  payload: Record<string, unknown>;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WebhookDeliveryDocument = WebhookDelivery;
