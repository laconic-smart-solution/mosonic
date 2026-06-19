import { IsNumber, Min } from 'class-validator';

export class UpdateNodeCreditPriceDto {
  @IsNumber()
  @Min(0.000001)
  costUsd!: number;
}
