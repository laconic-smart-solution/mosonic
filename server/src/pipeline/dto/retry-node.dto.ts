import { IsNotEmpty, IsString } from 'class-validator';

export class RetryNodeDto {
  @IsString()
  @IsNotEmpty()
  nodeId: string;
}
