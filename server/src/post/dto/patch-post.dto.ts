import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PatchPostDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32_000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;
}
