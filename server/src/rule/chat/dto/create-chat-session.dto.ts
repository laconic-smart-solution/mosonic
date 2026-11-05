import { IsOptional, IsString } from 'class-validator';

export class CreateChatSessionDto {
  @IsOptional()
  @IsString()
  ruleId?: string;

  @IsOptional()
  @IsString()
  title?: string;
}
