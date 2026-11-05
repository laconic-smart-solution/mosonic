import { IsIn } from 'class-validator';
import type { RuleAssetType } from '@prisma/client';

const RULE_ASSET_TYPES: RuleAssetType[] = [
  'logo',
  'reference_image',
  'guideline_document',
];

/** Multipart form field `type`; the file itself comes via `@UploadedFile()`. */
export class CreateRuleAssetDto {
  @IsIn(RULE_ASSET_TYPES)
  type!: RuleAssetType;
}
