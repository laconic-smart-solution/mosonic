import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

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

  /**
   * Workflow template node IDs to pause for review when executionMode is step.
   * Omit for legacy behavior (pause all reviewable steps).
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reviewNodeIds?: string[];
}
