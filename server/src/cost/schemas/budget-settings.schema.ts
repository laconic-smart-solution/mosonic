import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const BUDGET_LIMIT_ACTIONS = ['warn', 'stop'] as const;
export type BudgetLimitAction = (typeof BUDGET_LIMIT_ACTIONS)[number];

@Schema({ collection: 'budget_settings', timestamps: true })
export class BudgetSettings {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ type: Number })
  monthlyLimitUsd?: number;

  @Prop({ type: Number, default: 80 })
  warningThresholdPct: number;

  @Prop({
    type: String,
    enum: BUDGET_LIMIT_ACTIONS,
    default: 'warn',
  })
  onMonthlyLimitHit: BudgetLimitAction;

  @Prop({ type: Number })
  perRunLimitUsd?: number;

  @Prop({
    type: String,
    enum: BUDGET_LIMIT_ACTIONS,
    default: 'stop',
  })
  onRunLimitHit: BudgetLimitAction;

  @Prop({ type: Boolean, default: true })
  emailAlerts: boolean;

  @Prop({ type: Boolean, default: true })
  inAppAlerts: boolean;
}

export const BudgetSettingsSchema =
  SchemaFactory.createForClass(BudgetSettings);
export type BudgetSettingsDocument = HydratedDocument<BudgetSettings>;
