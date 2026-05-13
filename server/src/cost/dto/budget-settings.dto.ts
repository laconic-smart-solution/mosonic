import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { BUDGET_LIMIT_ACTIONS } from '../schemas/budget-settings.schema';

export class UpdateBudgetSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyLimitUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  warningThresholdPct?: number;

  @IsOptional()
  @IsIn([...BUDGET_LIMIT_ACTIONS])
  onMonthlyLimitHit?: (typeof BUDGET_LIMIT_ACTIONS)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  perRunLimitUsd?: number;

  @IsOptional()
  @IsIn([...BUDGET_LIMIT_ACTIONS])
  onRunLimitHit?: (typeof BUDGET_LIMIT_ACTIONS)[number];

  @IsOptional()
  @IsBoolean()
  emailAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppAlerts?: boolean;
}
