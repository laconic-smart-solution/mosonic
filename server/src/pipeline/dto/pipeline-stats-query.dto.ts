import { IsOptional, IsString } from 'class-validator';

export class PipelineStatsQueryDto {
  @IsOptional()
  @IsString()
  workflowRef?: string;
}
