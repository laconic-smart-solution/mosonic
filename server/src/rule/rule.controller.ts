import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { ExtractRuleResponseDto } from './dto/extract-rule.dto';
import { ruleExtractMaxFileBytes, ruleExtractMaxFiles } from './extract-limits';
import { parseRuleExtractMultipart } from './extract-multipart';
import { MulterExceptionFilter } from './multer-exception.filter';
import { ReplaceRuleDto } from './dto/replace-rule.dto';
import {
  RulePageQueryDto,
  RulePageResponseDto,
} from './dto/rule-page-query.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RuleService } from './rule.service';

@Controller('rules')
export class RuleController {
  constructor(private readonly ruleService: RuleService) {}

  /** Multipart: fields `input` (optional), `urls` (optional JSON string array), files field `files` (repeatable). */
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

  @Post('pageable')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async pageable(@Body() body: RulePageQueryDto): Promise<RulePageResponseDto> {
    const { data, total } = await this.ruleService.findPage(body);
    const page = body.page ?? 1;
    const limit = body.limit ?? 10;
    const totalPages = Math.ceil(total / limit) || 0;
    return {
      data,
      meta: { total, page, limit, totalPages },
    };
  }

  @Patch(':ruleId')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  patchRule(@Param('ruleId') ruleId: string, @Body() body: UpdateRuleDto) {
    return this.ruleService.patchRule(ruleId, body);
  }

  @Put(':ruleId')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  replaceRule(@Param('ruleId') ruleId: string, @Body() body: ReplaceRuleDto) {
    return this.ruleService.replaceRule(ruleId, body);
  }

  @Get(':ruleId')
  getRuleById(@Param('ruleId') ruleId: string) {
    return this.ruleService.getRuleById(ruleId);
  }
}
