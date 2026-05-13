import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const ZERNIO_SCHEDULED_SYNC_LOCK_ID = 'zernio_scheduled_sync';

@Schema({ collection: 'sync_locks' })
export class SyncLock {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, required: true })
  owner: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export const SyncLockSchema = SchemaFactory.createForClass(SyncLock);
export type SyncLockDocument = HydratedDocument<SyncLock>;
