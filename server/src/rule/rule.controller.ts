import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Express, Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
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

@UseGuards(JwtAuthGuard)
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
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body('input') input?: string,
    @Body('urls') urlsRaw?: string,
  ): Promise<ExtractRuleResponseDto> {
    const args = parseRuleExtractMultipart(files, input, urlsRaw);
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.ruleService.requestExtraction(args, auth);
  }

  @Post('pageable')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async pageable(
    @Req() req: Request,
    @Body() body: RulePageQueryDto,
  ): Promise<RulePageResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    const { data, total } = await this.ruleService.findPage(body, auth);
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
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  patchRule(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Body() body: UpdateRuleDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.ruleService.patchRule(ruleId, body, auth);
  }

  @Put(':ruleId')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  replaceRule(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Body() body: ReplaceRuleDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.ruleService.replaceRule(ruleId, body, auth);
  }

  @Get(':ruleId')
  getRuleById(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.ruleService.getRuleById(ruleId, auth);
  }
}
