import { IsUUID } from 'class-validator';

export class InitiatePlanUpgradeDto {
  @IsUUID()
  planId!: string;
}
