import { IsString, MinLength } from 'class-validator';

export class AskRuleToolsDto {
  @IsString()
  @MinLength(1)
  query!: string;
}
