import { IsString } from 'class-validator';

export class BindChatSessionRuleDto {
  @IsString()
  ruleId!: string;
}
