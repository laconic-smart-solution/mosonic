import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class UserEditsBodyDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  translatedText?: string;

  @IsOptional()
  @IsString()
  transcription?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  video?: string;
}

export class SaveContentDto {
  @ValidateNested()
  @Type(() => UserEditsBodyDto)
  userEdits!: UserEditsBodyDto;
}
