import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserPlanStatus = 'active' | 'suspended';

@Schema({ collection: 'user_plans', timestamps: true })
export class UserPlan {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  planId: string;

  /** Snapshot at assignment; refreshed on assign or monthly reset. */
  @Prop({ required: true })
  creditsPerMonth: number;

  @Prop({ required: true })
  billingPeriod: Date;

  @Prop({ required: true, default: 0 })
  creditsUsed: number;

  @Prop({ required: true })
  creditsRemaining: number;

  @Prop({
    required: true,
    type: String,
    enum: ['active', 'suspended'],
    default: 'active',
    index: true,
  })
  status: UserPlanStatus;

  @Prop({ type: Date, default: null })
  lowBalanceNotifiedAt?: Date | null;
}

export const UserPlanSchema = SchemaFactory.createForClass(UserPlan);
export type UserPlanDocument = HydratedDocument<UserPlan>;

UserPlanSchema.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
