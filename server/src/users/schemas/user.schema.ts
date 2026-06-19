import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  ADMIN = 'ADMIN',
  CUSTOMER = 'CUSTOMER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

@Schema({ _id: false })
export class ZernioConnectedAccount {
  @Prop({ type: String, required: true })
  channel: string;

  @Prop({ type: String, required: true })
  accountId: string;

  @Prop({ type: Date, required: true, default: () => new Date() })
  connectedAt: Date;
}
export const ZernioConnectedAccountSchema = SchemaFactory.createForClass(
  ZernioConnectedAccount,
);

@Schema({
  collection: 'users',
  timestamps: true,
})
export class User {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  userId: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  authServerUserId: string;

  @Prop({ type: String })
  email?: string;

  @Prop({ type: String })
  username?: string;

  @Prop({ type: String })
  firstName?: string;

  @Prop({ type: String })
  lastName?: string;

  @Prop({ type: String })
  avatarUrl?: string;

  @Prop({
    type: String,
    enum: Object.values(UserRole),
    required: true,
    default: UserRole.CUSTOMER,
    index: true,
  })
  role: UserRole;

  @Prop({
    type: String,
    enum: Object.values(UserStatus),
    required: true,
    default: UserStatus.ACTIVE,
    index: true,
  })
  status: UserStatus;

  @Prop({ type: Date })
  lastLoginAt?: Date;

  /** Zernio profile id (REST); created lazily on first connect/publish. */
  @Prop({ type: String })
  zernioProfileId?: string;

  /** Connected Zernio accounts by channel (e.g. instagram). */
  @Prop({ type: [ZernioConnectedAccountSchema], default: [] })
  zernioConnectedAccounts:
    | ZernioConnectedAccount[]
    | Record<string, string>;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ zernioProfileId: 1 }, { unique: true, sparse: true });
