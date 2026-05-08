import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RerunNodeDto {
  @IsString()
  @IsNotEmpty()
  nodeId!: string;

  @IsOptional()
  @IsString()
  updatedPrompt?: string;
}
