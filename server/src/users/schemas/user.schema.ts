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
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
