import { IsOptional, IsString } from 'class-validator';

export class RegenerateSectionDto {
  @IsOptional()
  @IsString()
  userInstruction?: string;
}

