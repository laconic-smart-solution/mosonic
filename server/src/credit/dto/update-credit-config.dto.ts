import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateCreditConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  creditPriceUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  marginTarget?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  basicUsersPerMonth?: number;
}
