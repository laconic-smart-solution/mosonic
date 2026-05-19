import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class UpdateWorkflowResponseDto {
  workflowId!: string;
  name!: string;
}
