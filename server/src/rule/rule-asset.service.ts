import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { TenancyAuth } from '../auth/tenancy.types';
import { ImageFileService } from '../content/image-file.service';
import { LlmService } from '../llm/llm.service';
import { extractPdfText } from '../preprocessing/pdf-text';
import { RULE_ASSET_REPOSITORY } from '../repositories/tokens';
import type { IRuleAssetRepository } from '../repositories/interfaces/rule-asset.repository.interface';
import {
  RAG_TEXT_LENGTH_THRESHOLD,
  splitTextIntoChunks,
} from './rule-asset-chunk-text.util';
import { RuleService } from './rule.service';

const IMAGE_ASSET_TYPES = new Set(['logo', 'reference_image']);

const AI_DESCRIBABLE_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);

@Injectable()
export class RuleAssetService {
  private readonly logger = new Logger(RuleAssetService.name);

  constructor(
    @Inject(RULE_ASSET_REPOSITORY)
    private readonly ruleAssets: IRuleAssetRepository,
    private readonly ruleService: RuleService,
    private readonly imageFileService: ImageFileService,
    private readonly llm: LlmService,
  ) {}

  async listByRule(ruleId: string, auth: TenancyAuth) {
    await this.ruleService.getRuleById(ruleId, auth);
    return this.ruleAssets.findByRuleId(ruleId, auth);
  }

  async delete(ruleAssetId: string, auth: TenancyAuth): Promise<void> {
    const deleted = await this.ruleAssets.deleteById(ruleAssetId, auth);
    if (!deleted) {
      throw new NotFoundException(`Rule asset ${ruleAssetId} not found`);
    }
  }

  async upload(
    ruleId: string,
    type: 'logo' | 'reference_image' | 'guideline_document',
    file: Express.Multer.File,
    auth: TenancyAuth,
  ) {
    await this.ruleService.getRuleById(ruleId, auth);

    const uploaded = await this.imageFileService.upload(
      file,
      `rule-assets/${ruleId}`,
    );

    const asset = await this.ruleAssets.create({
      ruleId,
      userId: auth.userId,
      type,
      status: 'processing',
      fileUrl: uploaded.fileUrl,
      relativePath: uploaded.relativePath,
      originalFileName: uploaded.originalFileName,
      mimeType: file.mimetype,
      fileSize: file.size,
    });

    void this.processAsset(asset.ruleAssetId, type, file).catch((err) => {
      this.logger.error(
        `Failed to process rule asset ${asset.ruleAssetId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return asset;
  }

  private async processAsset(
    ruleAssetId: string,
    type: 'logo' | 'reference_image' | 'guideline_document',
    file: Express.Multer.File,
  ): Promise<void> {
    try {
      if (IMAGE_ASSET_TYPES.has(type)) {
        // Vision API accepts png/jpeg/gif/webp only; store others (e.g. SVG logos) without a description.
        if (!AI_DESCRIBABLE_IMAGE_MIME.has(file.mimetype?.toLowerCase())) {
          await this.ruleAssets.updateById(ruleAssetId, { status: 'ready' });
          return;
        }
        const description = await this.llm.describeImageForExtraction(
          file.buffer,
          file.mimetype,
        );
        await this.ruleAssets.updateById(ruleAssetId, {
          aiDescription: description,
          status: 'ready',
        });
        return;
      }

      const text = await extractPdfText(file.buffer);
      if (!text.trim()) {
        await this.ruleAssets.updateById(ruleAssetId, {
          status: 'failed',
          errorMessage: 'No extractable text found in document',
        });
        return;
      }

      if (text.length <= RAG_TEXT_LENGTH_THRESHOLD) {
        await this.ruleAssets.updateById(ruleAssetId, {
          extractedText: text,
          ragEnabled: false,
          status: 'ready',
        });
        return;
      }

      const chunkTexts = splitTextIntoChunks(text);
      const embeddings = await this.llm.embedTexts(chunkTexts);
      await this.ruleAssets.createChunks(
        ruleAssetId,
        chunkTexts.map((chunkText, index) => ({
          chunkIndex: index,
          text: chunkText,
          embedding: embeddings[index],
        })),
      );
      await this.ruleAssets.updateById(ruleAssetId, {
        extractedText: text.slice(0, RAG_TEXT_LENGTH_THRESHOLD),
        ragEnabled: true,
        status: 'ready',
      });
    } catch (err) {
      await this.ruleAssets.updateById(ruleAssetId, {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
