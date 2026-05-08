import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  ChannelPriority,
  GenderOption,
  PostingFrequency,
} from '../schemas/rule.schema';

export class AgeRangeDto {
  @IsNumber()
  min!: number;

  @IsNumber()
  max!: number;
}

export class BrandDto {
  @IsString()
  brandName!: string;

  @IsString()
  industry!: string;

  @IsString()
  brandDescription!: string;

  @IsArray()
  @IsString({ each: true })
  brandTone!: string[];

  @IsString()
  brandVoice!: string;

  @IsArray()
  @IsString({ each: true })
  brandRestrictions!: string[];

  @IsString()
  callToAction!: string;
}

export class AudienceDto {
  @IsString()
  description!: string;

  @ValidateNested()
  @Type(() => AgeRangeDto)
  ageRange!: AgeRangeDto;

  @IsEnum(GenderOption)
  gender!: GenderOption;

  @IsArray()
  @IsString({ each: true })
  location!: string[];

  @IsArray()
  @IsString({ each: true })
  interests!: string[];

  @IsArray()
  @IsString({ each: true })
  painPoints!: string[];

  @IsString()
  language!: string;

  @IsArray()
  @IsString({ each: true })
  targetLanguages!: string[];
}

export class CampaignDurationDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

export class CampaignDto {
  @IsArray()
  @IsString({ each: true })
  goals!: string[];

  @IsArray()
  @IsString({ each: true })
  keywords!: string[];

  @IsArray()
  @IsString({ each: true })
  hashtagStrategy!: string[];

  @IsArray()
  @IsString({ each: true })
  contentFormats!: string[];

  @ValidateNested()
  @Type(() => CampaignDurationDto)
  duration!: CampaignDurationDto;

  @IsEnum(PostingFrequency)
  postingFrequency!: PostingFrequency;

  @IsArray()
  @IsString({ each: true })
  customSchedule!: string[];
}

export class ChannelEntryDto {
  @IsString()
  channel!: string;

  @IsEnum(ChannelPriority)
  priority!: ChannelPriority;

  @IsString()
  contentStyle!: string;
}

export class SeoGuidelinesDto {
  @IsArray()
  @IsString({ each: true })
  primaryKeywords!: string[];

  @IsArray()
  @IsString({ each: true })
  secondaryKeywords!: string[];

  @IsString()
  keywordDensity!: string;
}

export class ContentGuidelinesDto {
  @IsArray()
  @IsString({ each: true })
  dos!: string[];

  @IsArray()
  @IsString({ each: true })
  donts!: string[];

  @IsArray()
  @IsString({ each: true })
  requiredElements!: string[];

  @ValidateNested()
  @Type(() => SeoGuidelinesDto)
  seoGuidelines!: SeoGuidelinesDto;
}
