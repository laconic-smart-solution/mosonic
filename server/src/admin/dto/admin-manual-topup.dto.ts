import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AdminManualTopupDto {
  @ApiProperty({ example: 500, minimum: 1, maximum: 100_000 })
  @IsInt()
  @Min(1)
  @Max(100_000)
  credits: number;

  @ApiProperty({ example: 'Support compensation for failed pipeline run' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
