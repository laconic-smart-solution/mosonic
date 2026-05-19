import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

@Schema({ collection: 'integration_api_keys', timestamps: true })
export class IntegrationApiKey {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  keyId: string;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  keyHash: string;

  @Prop({ type: [String], default: ['pipeline:start'] })
  scopes: string[];

  @Prop({ type: Boolean, default: true })
  enabled: boolean;
}

export const IntegrationApiKeySchema =
  SchemaFactory.createForClass(IntegrationApiKey);
export type IntegrationApiKeyDocument = HydratedDocument<IntegrationApiKey>;
