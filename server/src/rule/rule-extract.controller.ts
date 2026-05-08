import {
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { ExtractRuleResponseDto } from './dto/extract-rule.dto';
import { ruleExtractMaxFileBytes, ruleExtractMaxFiles } from './extract-limits';
import { parseRuleExtractMultipart } from './extract-multipart';
import { MulterExceptionFilter } from './multer-exception.filter';
import { RuleService } from './rule.service';

/** Same behavior as [RuleController.extract](rule.controller.ts); path matches product spec `POST /rule/extract`. */
@Controller('rule')
export class RuleExtractController {
  constructor(private readonly ruleService: RuleService) {}

  @Post('extract')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FilesInterceptor('files', ruleExtractMaxFiles(), {
      limits: { fileSize: ruleExtractMaxFileBytes() },
    }),
  )
  extract(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body('input') input?: string,
    @Body('urls') urlsRaw?: string,
  ): Promise<ExtractRuleResponseDto> {
    const args = parseRuleExtractMultipart(files, input, urlsRaw);
    return this.ruleService.requestExtraction(args);
  }
}
