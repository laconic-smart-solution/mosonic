import { IsOptional, IsString } from 'class-validator';

export class GenerateWorkflowRequestDto {
  @IsString()
  contentPrompt!: string;

  @IsOptional()
  @IsString()
  ruleId?: string;
}

export class GenerateWorkflowResponseDto {
  workflowId!: string;
  ruleId!: string;
}

export class RegenerateWorkflowByRuleRequestDto {
  @IsString()
  contentPrompt!: string;
}

export class RegenerateWorkflowByRuleResponseDto {
  workflowId!: string;
  ruleId!: string;
}
