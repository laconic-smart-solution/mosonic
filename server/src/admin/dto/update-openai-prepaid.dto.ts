import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class UpdateOpenAiPrepaidDto {
  @ApiProperty({ example: 250, minimum: 0 })
  @IsNumber()
  @Min(0)
  prepaidCreditUsd!: number;
}
