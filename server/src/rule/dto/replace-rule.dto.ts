import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';
import {
  AudienceDto,
  BrandDto,
  CampaignDto,
  ChannelEntryDto,
  ContentGuidelinesDto,
} from './rule-body.dto';

/** Full editable rule body for PUT. System fields (ruleId, originalInput, versions, status) are preserved server-side. */
export class ReplaceRuleDto {
  @IsString()
  name!: string;

  @ValidateNested()
  @Type(() => BrandDto)
  brand!: BrandDto;

  @ValidateNested()
  @Type(() => AudienceDto)
  audience!: AudienceDto;

  @ValidateNested()
  @Type(() => CampaignDto)
  campaign!: CampaignDto;

  @ValidateNested({ each: true })
  @Type(() => ChannelEntryDto)
  channels!: ChannelEntryDto[];

  @ValidateNested()
  @Type(() => ContentGuidelinesDto)
  contentGuidelines!: ContentGuidelinesDto;
}
