import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import {
  ContentPageQueryDto,
  ContentPageResponseDto,
} from './dto/content-page-query.dto';
import { GenerateNodeDto } from './dto/generate-node.dto';
import { RerunNodeDto } from './dto/rerun-node.dto';
import { SaveContentDto } from './dto/save-content.dto';
import { ContentService } from './content.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

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
  @UsePipes(bodyPipe)
  async rerunNode(
    @Req() req: Request,
    @Param('contentId') contentId: string,
    @Body() body: RerunNodeDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    await this.contentService.scheduleRerun(contentId, body, auth);
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
  @UsePipes(bodyPipe)
  async generateNode(
    @Req() req: Request,
    @Param('contentId') contentId: string,
    @Body() body: GenerateNodeDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return await this.contentService.scheduleGenerateNode(contentId, body, auth);
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
  async approve(
    @Req() req: Request,
    @Param('contentId') contentId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.contentService.approveContent(contentId, auth);
  }

  @Post(':contentId/reject')
  async reject(
    @Req() req: Request,
    @Param('contentId') contentId: string,
  ) {
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
