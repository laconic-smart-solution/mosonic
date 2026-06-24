import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ReplanOperationDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  payload?: Record<string, unknown>;
}

export class ReplanPipelineDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReplanOperationDto)
  operations!: ReplanOperationDto[];
}
