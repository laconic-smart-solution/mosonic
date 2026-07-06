import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class NodeReviewDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['continue', 'edit', 'regenerate'])
  action!: 'continue' | 'edit' | 'regenerate';

  @IsOptional()
  @IsString()
  editedContent?: string;

  @IsOptional()
  @IsString()
  regenerateInstruction?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;
}
