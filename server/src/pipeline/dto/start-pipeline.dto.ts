import { IsNotEmpty, IsString } from 'class-validator';

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
}
