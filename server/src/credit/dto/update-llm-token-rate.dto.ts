import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateLlmTokenRateDto {
  @IsString()
  provider!: string;

  @IsNumber()
  @Min(0)
  inputPerMToken!: number;

  @IsNumber()
  @Min(0)
  outputPerMToken!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reasoningPerMToken?: number | null;
}
