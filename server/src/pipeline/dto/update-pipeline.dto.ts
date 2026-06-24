import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePipelineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;
}

export class UpdatePipelineResponseDto {
  pipelineId!: string;
  name!: string;
}
