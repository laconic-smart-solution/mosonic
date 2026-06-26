import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StartPipelineDto {
  @IsString()
  @IsNotEmpty()
  workflowId: string;

  @IsString()
  @IsNotEmpty()
  ruleId: string;

  @IsString()
  @IsNotEmpty()
  contentPrompt: string;

  /** When true, merge applied analytics suggestions into an ephemeral rule overlay. */
  @IsOptional()
  @IsBoolean()
  useLearnings?: boolean;

  /** User review policy for manual runs: auto (default) or step. */
  @IsOptional()
  @IsIn(['auto', 'step'])
  executionMode?: 'auto' | 'step';
}
