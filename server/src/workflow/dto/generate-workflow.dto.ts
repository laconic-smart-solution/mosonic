import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { WorkflowQAAnswersDto } from './workflow-qa-answers.dto';

export class GenerateWorkflowRequestDto {
  @IsString()
  @IsNotEmpty()
  ruleId!: string;

  @ValidateNested()
  @Type(() => WorkflowQAAnswersDto)
  answers!: WorkflowQAAnswersDto;
}

export class GenerateWorkflowResponseDto {
  workflowId!: string;
  ruleId!: string;
}

export class ApplyDefaultWorkflowStructureResponseDto {
  workflowId!: string;
  ruleId!: string;
}

export class RegenerateWorkflowByRuleRequestDto {
  @ValidateNested()
  @Type(() => WorkflowQAAnswersDto)
  answers!: WorkflowQAAnswersDto;
}

export class RegenerateWorkflowByRuleResponseDto {
  workflowId!: string;
  ruleId!: string;
}
