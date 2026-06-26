import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
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
import { RuleService } from './rule.service';

/** Same behavior as [RuleController.extract](rule.controller.ts); path matches product spec `POST /rule/extract`. */
@UseGuards(JwtAuthGuard)
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
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body('input') input?: string,
    @Body('urls') urlsRaw?: string,
    @Body('intake') intakeRaw?: string,
  ): Promise<ExtractRuleResponseDto> {
    const args = parseRuleExtractMultipart(files, input, urlsRaw, intakeRaw);
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.ruleService.requestExtraction(args, auth);
  }
}
