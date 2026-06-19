import { IsString } from 'class-validator';

export class EstimatePipelineDto {
  @IsString()
  workflowId: string;
}
