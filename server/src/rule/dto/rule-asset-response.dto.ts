import type { RuleAssetStatus, RuleAssetType } from '@prisma/client';

export class RuleAssetResponseDto {
  ruleAssetId!: string;
  ruleId!: string;
  type!: RuleAssetType;
  status!: RuleAssetStatus;
  fileUrl!: string;
  relativePath!: string | null;
  originalFileName!: string;
  mimeType!: string;
  fileSize!: number;
  aiDescription!: string | null;
  extractedText!: string | null;
  ragEnabled!: boolean;
  errorMessage!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
