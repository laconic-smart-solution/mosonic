import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Express, Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import {
  ruleExtractMaxFileBytes,
  ruleExtractMaxFiles,
} from '../rule/extract-limits';
import { MulterExceptionFilter } from '../rule/multer-exception.filter';
import {
  ContentPageQueryDto,
  ContentPageResponseDto,
} from './dto/content-page-query.dto';
import { GenerateNodeDto } from './dto/generate-node.dto';
import { RerunNodeDto } from './dto/rerun-node.dto';
import { SaveContentDto } from './dto/save-content.dto';
import { parseContentRerunMultipart } from './parse-content-rerun-multipart';
import { parseContentGenerateMultipart } from './parse-content-generate-multipart';
import { ContentService } from './content.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function isMultipart(req: Request): boolean {
  const ct = String(req.headers['content-type'] ?? '').toLowerCase();
  return ct.includes('multipart/form-data');
}

@UseGuards(JwtAuthGuard)
@Controller('contents')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post('pageable')
  @UsePipes(bodyPipe)
  async pageable(
    @Req() req: Request,
    @Body() body: ContentPageQueryDto,
  ): Promise<ContentPageResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    const { data, total } = await this.contentService.findPage(body, auth);
    const page = body.page ?? 1;
    const limit = body.limit ?? 10;
    const totalPages = Math.ceil(total / limit) || 0;
    return { data, meta: { total, page, limit, totalPages } };
  }

  @Get('stats')
  async stats(@Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.contentService.getContentStats(auth);
  }

  @Post(':contentId/save')
  @UsePipes(bodyPipe)
  async saveContent(
    @Req() req: Request,
    @Param('contentId') contentId: string,
    @Body() body: SaveContentDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.contentService.saveContent(contentId, body, auth);
  }

  @Post(':contentId/rerun-node')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FilesInterceptor('files', ruleExtractMaxFiles(), {
      limits: { fileSize: ruleExtractMaxFileBytes() },
    }),
  )
  async rerunNode(
    @Req() req: Request,
    @Param('contentId') contentId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);

    if (isMultipart(req) || (files && files.length > 0)) {
      const parsed = parseContentRerunMultipart(files, body);
      await this.contentService.scheduleRerun(contentId, parsed.dto, auth, {
        files: parsed.files,
        urls: parsed.urls,
      });
      return { success: true };
    }

    const dto = plainToInstance(RerunNodeDto, body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
    await this.contentService.scheduleRerun(contentId, dto, auth);
    return { success: true };
  }

  @Get(':contentId/available-node-types')
  async availableNodeTypes(
    @Req() req: Request,
    @Param('contentId') contentId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    const types = await this.contentService.getAvailableNodeTypes(
      contentId,
      auth,
    );
    return { types };
  }

  @Post(':contentId/generate-node')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FilesInterceptor('files', ruleExtractMaxFiles(), {
      limits: { fileSize: ruleExtractMaxFileBytes() },
    }),
  )
  async generateNode(
    @Req() req: Request,
    @Param('contentId') contentId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);

    if (isMultipart(req) || (files && files.length > 0)) {
      const parsed = parseContentGenerateMultipart(files, body);
      return await this.contentService.scheduleGenerateNode(
        contentId,
        parsed.dto,
        auth,
        { files: parsed.files, urls: parsed.urls },
      );
    }

    const dto = plainToInstance(GenerateNodeDto, body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
    return await this.contentService.scheduleGenerateNode(contentId, dto, auth);
  }

  @Post(':contentId/ensure-upload')
  async ensureUpload(
    @Req() req: Request,
    @Param('contentId') contentId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.contentService.ensureUploadForContent(contentId, auth);
  }

  @Post(':contentId/approve')
  async approve(@Req() req: Request, @Param('contentId') contentId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.contentService.approveContent(contentId, auth);
  }

  @Post(':contentId/reject')
  async reject(@Req() req: Request, @Param('contentId') contentId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.contentService.rejectContent(contentId, auth);
  }

  @Get(':contentId')
  async getByContentId(
    @Req() req: Request,
    @Param('contentId') contentId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.contentService.getContentDetail(contentId, auth);
  }
}
