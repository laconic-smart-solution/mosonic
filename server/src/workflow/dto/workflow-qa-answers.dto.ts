import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsString,
  ValidateIf,
} from 'class-validator';

export class WorkflowQAAnswersDto {
  @IsBoolean()
  useWebSearch!: boolean;

  @IsBoolean()
  useKeywordPlanner!: boolean;

  @IsBoolean()
  generateSummary!: boolean;

  @ValidateIf((o: WorkflowQAAnswersDto) => o.generateSummary)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  summaryChannels!: string[];

  @IsBoolean()
  generateImage!: boolean;

  @ValidateIf((o: WorkflowQAAnswersDto) => o.generateImage)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  imageChannels!: string[];

  @IsBoolean()
  generateVideo!: boolean;

  @ValidateIf((o: WorkflowQAAnswersDto) => o.generateVideo)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  videoChannels!: string[];

  @IsBoolean()
  translate!: boolean;

  @ValidateIf((o: WorkflowQAAnswersDto) => o.translate)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  translationChannels!: string[];

  @ValidateIf((o: WorkflowQAAnswersDto) => o.translate)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targetLanguages!: string[];

  @IsString()
  additionalMessage!: string;
}
