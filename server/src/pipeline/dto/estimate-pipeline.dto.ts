import { IsOptional, IsString } from 'class-validator';

export class EstimatePipelineDto {
  @IsString()
  workflowId: string;

  @IsOptional()
  @IsString()
  ruleId?: string;
}
