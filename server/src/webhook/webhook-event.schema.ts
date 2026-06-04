import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WebhookEventDocument = HydratedDocument<WebhookEvent>;

@Schema({ collection: 'webhook_events', timestamps: true })
export class WebhookEvent {
  /** X-Zernio-Event-Id — unique for idempotency */
  @Prop({ required: true, unique: true })
  eventId: string;

  @Prop({ required: true })
  event: string;

  @Prop({ type: Date, required: true })
  processedAt: Date;
}

export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEvent);
