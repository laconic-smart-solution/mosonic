import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import {
  AudienceDto,
  BrandDto,
  CampaignDto,
  ChannelEntryDto,
  ContentGuidelinesDto,
} from './rule-body.dto';

/** Nested patches accept partial objects (PATCH semantics). */
export class PatchBrandDto extends PartialType(BrandDto) {}

export class PatchAudienceDto extends PartialType(AudienceDto) {}

export class PatchCampaignDto extends PartialType(CampaignDto) {}

export class PatchContentGuidelinesDto extends PartialType(
  ContentGuidelinesDto,
) {}

/** Partial rule update (PATCH). Only provided top-level keys are merged. */
export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchBrandDto)
  brand?: PatchBrandDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchAudienceDto)
  audience?: PatchAudienceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchCampaignDto)
  campaign?: PatchCampaignDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChannelEntryDto)
  channels?: ChannelEntryDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchContentGuidelinesDto)
  contentGuidelines?: PatchContentGuidelinesDto;
}
