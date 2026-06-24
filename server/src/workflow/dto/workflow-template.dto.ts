import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SaveAsTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  templateName!: string;
}

export class ApplyTemplateDto {
  @IsString()
  @IsNotEmpty()
  ruleId!: string;
}
