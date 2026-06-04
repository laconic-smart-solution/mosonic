import { IsNotEmpty, IsString } from 'class-validator';

export class SkipNodeDto {
  @IsString()
  @IsNotEmpty()
  nodeId: string;
}
